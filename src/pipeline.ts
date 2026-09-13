import { join } from "node:path";
import type { AppConfig, NewsBrief, SourceArticle } from "./types.ts";
import { collectWeeklyNews } from "./tavily.ts";
import { createNewsBrief } from "./llm.ts";
import { generateCoverPng } from "./cover.ts";
import { buildCoverDateRange, type RenderedArticle, renderWechatArticle } from "./render.ts";
import { publishWechatDraft } from "./wechat.ts";
import { timestamp, writeJson } from "./utils.ts";

export interface PipelineResult {
  runDir: string;
  sources: SourceArticle[];
  brief: NewsBrief;
  article: RenderedArticle;
  draftMediaId?: string;
}

export async function runPipeline(
  config: AppConfig,
  mode: "preview" | "publish",
): Promise<PipelineResult> {
  console.log(`[1/5] Tavily 搜索 ${config.searchQueries.length} 组跨境关键词`);
  const allSources = await collectWeeklyNews(
    config.searchQueries,
    config.tavilyApiKey,
    (message) => console.log(`      ${message}`),
  );
  const sources = allSources.slice(0, config.maxCandidates);
  if (sources.length === 0) throw new Error("Tavily 没有返回可用资讯，流程停止");
  console.log(`[2/5] URL 去重并按时间排序：保留 ${sources.length} 条候选`);

  const runDir = join(config.outputDir, timestamp());
  await Deno.mkdir(runDir, { recursive: true });
  await writeJson(join(runDir, "01-sources.json"), sources);

  console.log("[3/5] 大模型筛选、分类并生成摘要");
  const brief = await createNewsBrief(sources, config.llm);
  await writeJson(join(runDir, "02-brief.json"), brief);

  console.log("[4/5] 渲染微信公众号兼容的内联样式 HTML");
  const article = renderWechatArticle(brief, sources, config.brand, config.sourceWindowDays);
  await Deno.writeTextFile(join(runDir, "03-article.html"), article.previewHtml);

  let draftMediaId: string | undefined;
  if (mode === "publish") {
    let coverPath = config.wechat.coverPath;
    if (coverPath) {
      console.log(`[5/5] 使用指定封面 ${coverPath}，上传并创建微信公众号草稿`);
    } else {
      console.log("[5/5] 根据本期标题自动生成封面，上传并创建微信公众号草稿");
      coverPath = await generateCoverPng({
        title: article.title,
        dateRange: buildCoverDateRange(config.sourceWindowDays),
        outputPath: join(runDir, "04-cover.png"),
      });
    }
    draftMediaId = await publishWechatDraft(article, { ...config.wechat, coverPath });
    await writeJson(join(runDir, "05-publish-result.json"), { draftMediaId, coverPath });
  } else {
    console.log("[5/5] Preview 模式：跳过公众号 API，不创建草稿");
  }

  return { runDir, sources, brief, article, draftMediaId };
}

export async function renderSample(config: AppConfig): Promise<PipelineResult> {
  const sources: SourceArticle[] = [
    {
      id: "sample-1",
      title: "某跨境平台更新卖家政策",
      url: "https://example.com/platform-policy",
      snippet: "示例素材，仅用于离线检查排版。",
      publishedAt: new Date().toISOString(),
    },
    {
      id: "sample-2",
      title: "欧洲跨境电商合规规则出现新变化",
      url: "https://example.com/eu-regulation",
      snippet: "示例素材，仅用于离线检查排版。",
      publishedAt: new Date().toISOString(),
    },
  ];
  const brief: NewsBrief = {
    title: "跨境电商一周资讯汇总",
    categories: [
      {
        name: "平台动态",
        items: [{
          title: "卖家政策更新：经营流程需要及时调整",
          summary: "平台发布了新的卖家政策。实际运行时，这里会显示大模型基于搜索素材整理的摘要。",
          sourceIndex: 1,
        }],
      },
      {
        name: "合规观察",
        items: [{
          title: "欧洲市场合规规则值得跨境卖家关注",
          summary: "相关规则出现变化。卖家应阅读原文，并结合自身业务范围评估影响。",
          sourceIndex: 2,
        }],
      },
    ],
  };
  const article = renderWechatArticle(brief, sources, config.brand, config.sourceWindowDays);
  const runDir = join(config.outputDir, `sample-${timestamp()}`);
  await Deno.mkdir(runDir, { recursive: true });
  await writeJson(join(runDir, "01-sources.json"), sources);
  await writeJson(join(runDir, "02-brief.json"), brief);
  await Deno.writeTextFile(join(runDir, "03-article.html"), article.previewHtml);
  return { runDir, sources, brief, article };
}

/** 使用已有搜索和 AI 产物重新套模板，不重复消耗 Tavily 或大模型额度。 */
export async function rerenderArtifacts(config: AppConfig, runDir: string): Promise<string> {
  const sources = JSON.parse(
    await Deno.readTextFile(join(runDir, "01-sources.json")),
  ) as SourceArticle[];
  const brief = JSON.parse(
    await Deno.readTextFile(join(runDir, "02-brief.json")),
  ) as NewsBrief;
  const article = renderWechatArticle(brief, sources, config.brand, config.sourceWindowDays);
  const outputPath = join(runDir, "03-article-rerendered.html");
  await Deno.writeTextFile(outputPath, article.previewHtml);
  return outputPath;
}
