import { loadConfig, validateConfig } from "./config.ts";
import { generateCoverPng } from "./cover.ts";
import { renderSample, rerenderArtifacts, runPipeline } from "./pipeline.ts";
import { buildCoverDateRange, buildWeeklyTitle } from "./render.ts";

const rawCommand = Deno.args[0] ?? "preview";

if (["-h", "--help", "help"].includes(rawCommand)) {
  printHelp();
  Deno.exit(0);
}
if (!(["preview", "publish", "sample", "cover", "rerender"] as string[]).includes(rawCommand)) {
  console.error(`未知命令：${rawCommand}`);
  printHelp();
  Deno.exit(1);
}
const command = rawCommand as "preview" | "publish" | "sample" | "cover" | "rerender";

const config = loadConfig();

try {
  const maxCandidates = readPositiveInteger(Deno.args, "--max-candidates");
  if (maxCandidates) config.maxCandidates = maxCandidates;
  if (command === "cover") {
    const outputPath = await generateCoverPng({
      title: buildWeeklyTitle(config.sourceWindowDays),
      dateRange: buildCoverDateRange(config.sourceWindowDays),
      outputPath: "output/cover-preview.png",
    });
    console.log(`封面预览已生成：${outputPath}`);
  } else if (command === "rerender") {
    const runDir = Deno.args[1];
    if (!runDir) throw new Error("请提供已有的 output 运行目录");
    const outputPath = await rerenderArtifacts(config, runDir);
    console.log(`重新渲染完成：${outputPath}`);
  } else if (command === "sample") {
    console.log("生成离线示例，不访问 Tavily、大模型或微信 API。");
    const result = await renderSample(config);
    console.log(`完成：${result.runDir}/03-article.html`);
  } else {
    validateConfig(config, command);
    const result = await runPipeline(config, command);
    console.log(`\n完成：${result.runDir}`);
    console.log(`标题：${result.article.title}`);
    console.log(`入选：${result.brief.categories.flatMap((category) => category.items).length} 条`);
    if (result.draftMediaId) console.log(`微信草稿 media_id：${result.draftMediaId}`);
  }
} catch (error) {
  console.error(`\n运行失败：${error instanceof Error ? error.message : String(error)}`);
  Deno.exit(1);
}

function readPositiveInteger(args: string[], flag: string): number | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} 必须是正整数`);
  return value;
}

function printHelp(): void {
  console.log(`跨境资讯自动发布

用法：
  deno task sample                         离线生成示例 HTML
  deno task cover                          生成本期自动封面 PNG
  deno task rerender output/<运行目录>      用已有数据重新套模板，不调用 API
  deno task preview --max-candidates 20  搜索、AI 整理并生成本地预览
  deno task publish --max-candidates 20  完整运行并创建公众号草稿

安全约定：preview 是默认开发模式；只有显式执行 publish 才会调用微信 API。`);
}
