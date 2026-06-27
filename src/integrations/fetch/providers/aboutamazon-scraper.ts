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
  "https://www.aboutamazon.com/gca_api/search-articles?category=Retail&category=Operations&category=Transportation&category=Company+news&category=Innovation+at+Amazon&category=Policy+news+%26+views&includeHiddenFromSearch=true";

const ArticleListItemSchema = z.object({
  canonicalLink: z.string().optional(),
  publishDateTimestamp: z.number().optional(),
  title: z.string().optional(),
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
    const limit = normalizeLimit(options?.limit, 20, 50);
    const articles = await this.fetchArticleList();

    const sorted = articles
      .filter((item) => isHttpUrl(item.canonicalLink ?? ""))
      .sort((a, b) =>
        (b.publishDateTimestamp ?? 0) - (a.publishDateTimestamp ?? 0)
      )
      .slice(0, limit);

    const results: ScrapedContent[] = [];
    for (const article of sorted) {
      const url = article.canonicalLink!;
      try {
        const detail = await this.scrapeArticle(url, article);
        results.push(detail);
        await new Promise((resolve) => setTimeout(resolve, 1000));
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
      listItem.title?.trim() ??
      url;

    const publishDate = extractPublishDate(doc) ??
      normalizeTimestamp(listItem.publishDateTimestamp) ??
      new Date().toISOString();

    const content = doc
      .querySelector(".ArticlePage-mainContent article")
      ?.textContent
      ?.replace(/\s+/g, " ")
      .trim() ?? "";

    return {
      id: `aboutamazon_${stableHash(url)}`,
      title,
      content: content || title,
      url,
      publishDate,
      media: [],
      metadata: {
        source: "aboutamazon",
        provider: "aboutamazon",
      },
    };
  }
}

function extractPublishDate(document: { querySelectorAll(selectors: string): NodeListOf<Element> }): string | undefined {
  for (const script of Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  )) {
    try {
      const jsonLd = JSON.parse(script.textContent ?? "");
      if (jsonLd?.datePublished) {
        return jsonLd.datePublished;
      }
      if (jsonLd?.publisher?.datePublished) {
        return jsonLd.publisher.datePublished;
      }
    } catch {
      // 忽略解析失败的 ld+json 块
    }
  }
  return undefined;
}

function normalizeTimestamp(
  value: number | undefined,
): string | undefined {
  if (!value || !Number.isFinite(value)) return undefined;
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}
