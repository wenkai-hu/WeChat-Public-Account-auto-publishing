/**
 * 精简版微信文章工作流
 *
 * 跳过选题聚类、编辑决策、证据补全、文章计划、质量审稿等重步骤，
 * 直接从数据源抓取 → AI 筛选最相关内容 → 生成简报 → 套模板 → 输出。
 *
 * 用法:
 *   deno run -A scripts/run-lite.ts
 *   deno run -A scripts/run-lite.ts --dry-run
 *   deno run -A scripts/run-lite.ts --dry-run --max-articles 5
 */

import { getAppConfig, initializeAppConfig, parseConfigArgs, shutdownAppResources, validateAppConfig } from "@src/utils/config/app-config.ts";
import { planArticleSources } from "@src/app/weixin-article/fetch/article-fetch-planner.ts";
import { ArticleFetchRouter } from "@src/app/weixin-article/fetch/article-fetch-router.ts";
import { WeixinArticleContentScrapeService } from "@src/features/weixin-article/services/content-scrape.service.ts";
import { LlmProviderResolver } from "@src/integrations/llm/llm-provider-resolver.ts";
import { WeixinArticleTemplateRenderer } from "@src/features/weixin-article/rendering/article.renderer.ts";
import { resolvePromptProfile } from "@src/prompts/prompt-profile.ts";
import type { INotifier } from "@src/core/ports/notifier.ts";
import type { ScrapedContent } from "@src/core/ports/content-scraper.ts";
import type { ArticleSourceFilter } from "@src/features/weixin-article/services/content-scrape.service.ts";
import { join } from "node:path";

interface CliOptions {
  dryRun: boolean;
  maxArticles?: number;
  sourceType?: ArticleSourceFilter;
  dryRunOutputDir?: string;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { dryRun: true };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--no-dry-run":
        options.dryRun = false;
        break;
      case "--max-articles":
        options.maxArticles = Number(args[++i]);
        break;
      case "--source":
        options.sourceType = args[++i] as ArticleSourceFilter;
        break;
      case "--dry-run-output":
        options.dryRunOutputDir = args[++i];
        break;
      case "--help":
        console.log(`用法:
  deno run -A scripts/run-lite.ts [options]

选项:
  --dry-run               默认，只生成 HTML，不上传/发布
  --no-dry-run            真实上传图片并创建草稿
  --max-articles <n>      最多保留文章数 (默认 15)
  --source <type>         限制抓取 provider
  --dry-run-output <dir>  HTML 输出目录
  --help                  显示帮助
`);
        Deno.exit(0);
    }
  }
  return options;
}

function noopNotifier(): INotifier {
  return {
    refresh: () => Promise.resolve(),
    info: () => Promise.resolve(true),
    success: () => Promise.resolve(true),
    warning: () => Promise.resolve(true),
    error: () => Promise.resolve(true),
    notify: () => Promise.resolve(true),
  };
}

/** 按 URL 简单去重 */
function dedupByUrl(contents: ScrapedContent[]): ScrapedContent[] {
  const seen = new Set<string>();
  return contents.filter((c) => {
    const key = c.url?.toLowerCase() ?? c.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 把抓取到的内容按时间排序，取最新的 N 条 */
function sortByFreshness(contents: ScrapedContent[]): ScrapedContent[] {
  return [...contents].sort((a, b) => {
    const da = a.publishDate ? new Date(a.publishDate).getTime() : 0;
    const db = b.publishDate ? new Date(b.publishDate).getTime() : 0;
    return db - da;
  });
}

const parsedConfigArgs = parseConfigArgs(Deno.args);
const options = parseArgs(parsedConfigArgs.args);

try {
  await initializeAppConfig({ configPath: parsedConfigArgs.configPath });
  await validateAppConfig({ requireLLM: true, requireWeixinPublish: !options.dryRun });

  const config = await getAppConfig();
  const profile = resolvePromptProfile(config.features.article.renderer.promptProfile);
  const outputRoot = options.dryRunOutputDir ?? config.storage.artifacts.outputDir ?? "src/temp";

  console.log(`\n=== TrendPublish Lite ===`);
  console.log(`模板: ${config.features.article.renderer.template}`);
  console.log(`内容风格: ${profile.label}`);
  console.log(`模式: ${options.dryRun ? "Dry-Run (仅生成 HTML)" : "正式发布"}`);
  console.log(`数据源: ${config.features.article.sources.length} 个\n`);

  // ── 1. 抓取 ──
  console.log("[1/4] 抓取数据源...");
  const stats = { success: 0, failed: 0, contents: 0, duplicates: 0 };
  const scrapeService = new WeixinArticleContentScrapeService(
    planArticleSources(config),
    noopNotifier(),
    stats,
    new ArticleFetchRouter(config),
    config.features.article.sourceLimits,
  );
  const sources = await scrapeService.loadSources(options.sourceType);
  const scraped = await scrapeService.scrapeAllDetailed(sources);
  console.log(`  → 成功 ${stats.success}, 失败 ${stats.failed}, 内容 ${stats.contents} 条`);

  if (scraped.contents.length === 0) {
    throw new Error("未获取到任何内容");
  }

  // ── 2. 去重 + 排序 ──
  console.log("[2/4] 去重排序...");
  const unique = dedupByUrl(scraped.contents);
  const sorted = sortByFreshness(unique);
  const candidates = sorted.slice(0, options.maxArticles ?? 30);
  console.log(`  → 去重后 ${unique.length} 条, 候选 ${candidates.length} 条`);

  // ── 3. AI 筛选 + 写简报 ──
  console.log("[3/4] AI 筛选内容并生成简报...");
  const llm = await new LlmProviderResolver(config).getDefaultProvider();

  const sourcesText = candidates.map((c, i) => {
    const date = c.publishDate ? ` [${c.publishDate}]` : "";
    const contentPreview = (c.content ?? "").replace(/<next_paragraph\s*\/>/g, "\n").slice(0, 600);
    const url = c.url ?? "";
    return `[${i + 1}]${date} ${c.title}
来源: ${url}
${contentPreview}
---`;
  }).join("\n");

  const response = await llm.createChatCompletion([
    {
      role: "system",
      content: `你是跨境电商资讯简报编辑 "${profile.label}"。

${profile.editorialTone}

选材原则：
- ${profile.selectionFocus.join("\n- ")}

内容角度：
- ${profile.contentAngles.join("\n- ")}

${profile.titleGuidance}

输出格式要求：
返回 JSON，格式：
{
  "title": "文章标题",
  "categories": [
    {
      "name": "分类名（如「平台动态」「税务合规」「市场信息」）",
      "items": [
        {
          "title": "资讯标题",
          "summary": "1-3 段简述，说清楚谁、什么事、什么时候、为什么重要",
          "sourceIndex": 对应上面输入素材的编号
        }
      ]
    }
  ]
}

要求：
- 只从上面提供的素材里选材，不要编造信息
- 筛选出对跨境卖家/外贸从业者最有用的内容
- 分类要清晰，通常 2-4 个类别
- 每则资讯的 summary 用简单的话讲清楚即可
- 如果确实没有任何可用内容，返回 { "empty": true, "reason": "说明" }；但如果素材中有任何可能对跨境卖家有参考价值的信息（即使相关性一般），都应该整理输出，不要轻易返回 empty
- 输出纯 JSON，不要 Markdown 和解释
# ponytail: AI 筛选条件已放宽以适应当前测试阶段数据量较少的情况。后续添加更多数据源后，应逐步收紧筛选标准，提高内容相关性和质量门槛。`,
    },
    {
      role: "user",
      content: `以下是今日抓取到的 ${candidates.length} 条内容，请筛选出对跨境卖家最有用的资讯，按类别整理成简报。\n\n${sourcesText}`,
    },
  ]);

  const raw = response.choices?.[0]?.message?.content ?? "";
  let result: { title?: string; categories?: Array<{ name: string; items: Array<{ title: string; summary: string; sourceIndex?: number }> }>; empty?: boolean; reason?: string };

  try {
    result = JSON.parse(raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim());
  } catch {
    console.error("  ⚠ AI 返回非 JSON，尝试直接保存为纯文本");
    const outputDir = join(Deno.cwd(), outputRoot);
    await Deno.mkdir(outputDir, { recursive: true });
    const ts = new Date().toISOString().replaceAll(":", "-").replace(/\..+/, "");
    const outputPath = join(outputDir, `lite-article-${ts}.html`);
    await Deno.writeTextFile(outputPath, raw);
    console.log(`  → 已保存原始输出: ${outputPath}`);
    Deno.exit(0);
  }

  if (result.empty) {
    console.log(`  ⚠ AI 判断无可用内容: ${result.reason ?? ""}`);
    Deno.exit(0);
  }

  const articleTitle = result.title ?? "跨境电商资讯简报";

  // 组装渲染数据
  const articleContents: Array<{ title: string; content: string; category: string }> = [];
  for (const cat of result.categories ?? []) {
    for (const item of cat.items) {
      const source = typeof item.sourceIndex === "number" ? candidates[item.sourceIndex - 1] : undefined;
      articleContents.push({
        title: item.title,
        content: `【${cat.name}】${item.summary}`,
        category: cat.name,
      });
    }
  }

  console.log(`  → 筛选出 ${articleContents.length} 条资讯，${result.categories?.length ?? 0} 个分类`);

  // ── 4. 渲染 ──
  console.log("[4/4] 渲染模板...");
  const renderer = new WeixinArticleTemplateRenderer(undefined, false, undefined, undefined, "minimal");
  const templateData = articleContents.map((item, i) => {
    let sourceUrl = "";
    let sourceMedia: any[] = [];
    for (const cat of result.categories ?? []) {
      for (const it of cat.items) {
        if (it.title === item.title && typeof it.sourceIndex === "number") {
          const src = candidates[it.sourceIndex - 1];
          if (src) {
            sourceUrl = src.url ?? "";
            sourceMedia = src.media ?? [];
          }
        }
      }
    }
    return {
      id: `article-${i + 1}`,
      title: item.title,
      content: item.content.replace(/\n{2,}/g, "<next_paragraph />").replace(/\n/g, "<next_paragraph />"),
      url: sourceUrl,
      publishDate: new Date().toISOString().replace(/T.*/, ""),
      metadata: { category: item.category },
      keywords: [] as string[],
      media: sourceMedia,
    };
  });

  const html = await renderer.render(templateData, "minimal");
  const fullHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${articleTitle}</title>
</head>
<body>
${html}
</body>
</html>`;

  const outputDir = join(Deno.cwd(), outputRoot);
  await Deno.mkdir(outputDir, { recursive: true });
  const ts = new Date().toISOString().replaceAll(":", "-").replace(/\..+/, "");
  const outputPath = join(outputDir, `lite-article-${ts}.html`);
  await Deno.writeTextFile(outputPath, fullHtml);

  console.log(`\n=== 完成 ===`);
  console.log(`标题: ${articleTitle}`);
  console.log(`资讯: ${articleContents.length} 条`);
  console.log(`输出: ${outputPath}`);
  if (options.dryRun) {
    console.log(`状态: Dry-Run (如需正式发布请加 --no-dry-run)`);
  }
} finally {
  await shutdownAppResources();
}
