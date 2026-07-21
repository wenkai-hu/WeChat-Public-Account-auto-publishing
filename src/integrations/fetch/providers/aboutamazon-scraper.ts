import {
  ContentScraper,
  ScrapedContent,
  ScraperOptions,
} from "@src/core/ports/content-scraper.ts";
import { HttpClient } from "@src/utils/http/http-client.ts";
import { z } from "npm:zod@3.25.76";
import {
  isHttpUrl,
  normalizeLimit,
  stableHash,
} from "./search-result-utils.ts";
import { Logger } from "@zilla/logger";
import { JSDOM } from "npm:jsdom@26.1.0";

const logger = new Logger("aboutamazon-scraper");

const ABOUTAMAZON_API_URL =
  "https://www.aboutamazon.com/gca_api/search-articles?count=50";

// 对跨境卖家可能有用的分类
const RELEVANT_CATEGORIES = new Set([
  "Retail",
  "Company news",
  "Books and authors",
  "AWS",
]);

const ArticleListItemSchema = z.object({
  canonicalLink: z.string().optional(),
  category: z.string().optional(),
  updateTimestamp: z.number().optional(),
  seoAttributes: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
});

const ArticleListResponseSchema = z.object({
  data: z.object({
    articles: z.array(ArticleListItemSchema).optional(),
  }).optional(),
});

type ArticleListItem = z.infer<typeof ArticleListItemSchema>;

export class AboutAmazonScraper implements ContentScraper {
  constructor(private readonly httpClient = HttpClient.getInstance()) {}

  async scrape(
    _sourceId: string,
    options?: ScraperOptions,
  ): Promise<ScrapedContent[]> {
    const limit = normalizeLimit(options?.limit, 15, 50);
    const articles = await this.fetchArticleList();

    const sorted = articles
      .filter((item) => isHttpUrl(item.canonicalLink ?? ""))
      .filter((item) => RELEVANT_CATEGORIES.has(item.category ?? ""))
      .sort((a, b) =>
        (b.updateTimestamp ?? 0) - (a.updateTimestamp ?? 0)
      )
      .slice(0, limit);

    logger.info(
      `[aboutamazon] API 返回 ${articles.length} 条，筛选后 ${sorted.length} 条`,
    );

    const results: ScrapedContent[] = [];
    for (const article of sorted) {
      const url = article.canonicalLink!;
      try {
        const detail = await this.scrapeArticle(url, article);
        results.push(detail);
        await new Promise((resolve) => setTimeout(resolve, 800));
      } catch (error) {
        logger.warn(
          `[aboutamazon] 抓取失败 ${url}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return results;
  }

  private async fetchArticleList(): Promise<ArticleListItem[]> {
    const response = await this.httpClient.request<unknown>(
      ABOUTAMAZON_API_URL,
      {
        method: "GET",
        headers: { "Accept": "application/json" },
        retries: 2,
        timeout: 30000,
      },
    );
    const parsed = ArticleListResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new Error(
        `aboutamazon API 返回无效响应: ${parsed.error.toString()}`,
      );
    }
    return parsed.data.data?.articles ?? [];
  }

  private async scrapeArticle(
    url: string,
    listItem: ArticleListItem,
  ): Promise<ScrapedContent> {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; trend-publish-bot/1.0; +https://github.com/)",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }
    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const title = doc.querySelector("h1")?.textContent?.trim() ??
      listItem.seoAttributes?.title?.trim() ??
      url;

    const publishDate = extractPublishDate(doc) ??
      normalizeUpdateTimestamp(listItem.updateTimestamp) ??
      new Date().toISOString();

    // 从 JSON-LD 取封面图
    const coverImage = extractCoverImage(doc);

    // 保留段落结构的正文提取
    const article = doc.querySelector(".ArticlePage-mainContent article");
    const paragraphs: string[] = [];
    if (article) {
      for (const block of article.querySelectorAll(".contentContainer.block")) {
        const roleEl = block.querySelector("[class^='contentItem-role']");
        const role = roleEl?.className ?? "";
        if (role.includes("heading2")) {
          const text = block.textContent?.trim();
          if (text) paragraphs.push(`\n## ${text}`);
        } else if (role.includes("text")) {
          const texts: string[] = [];
          for (const el of block.querySelectorAll(".text.v2")) {
            const t = el.textContent?.trim();
            if (t) texts.push(t);
          }
          if (texts.length) paragraphs.push(texts.join(" "));
        } else if (role.includes("unorderedList")) {
          for (const li of block.querySelectorAll("li")) {
            const text = li.textContent?.trim();
            if (text) paragraphs.push(`- ${text}`);
          }
        }
      }
    }

    const content = paragraphs.length > 0
      ? paragraphs.join("\n\n")
      : (article?.textContent?.replace(/\s+/g, " ").trim() ?? title);

    return {
      id: `aboutamazon_${stableHash(url)}`,
      title,
      content: content || title,
      url,
      publishDate,
      media: coverImage ? [coverImage] : [],
      metadata: {
        source: "aboutamazon",
        provider: "aboutamazon",
      },
    };
  }
}

function extractCoverImage(doc: Document): { url: string; type: string; size: { width: number; height: number } } | undefined {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const jsonLd = JSON.parse(script.textContent ?? "");
      const images = jsonLd?.image;
      if (Array.isArray(images) && images.length > 0) {
        const img = images[0];
        return {
          url: img.url ?? "",
          type: "image",
          size: { width: img.width ?? 0, height: img.height ?? 0 },
        };
      }
    } catch {
      // 忽略
    }
  }
  return undefined;
}

function extractPublishDate(doc: Document): string | undefined {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const jsonLd = JSON.parse(script.textContent ?? "");
      if (jsonLd?.datePublished) return jsonLd.datePublished;
    } catch {
      // 忽略解析失败的 ld+json 块
    }
  }
  return undefined;
}

function normalizeUpdateTimestamp(
  value: number | undefined,
): string | undefined {
  // API 返回的 updateTimestamp 是毫秒级时间戳
  if (!value || !Number.isFinite(value)) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}
