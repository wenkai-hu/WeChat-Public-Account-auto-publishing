/**
 * 用 Windows 自带 Edge 无头模式把封面 HTML 模板渲染成 PNG。
 *
 * 中文走系统雅黑，零新依赖；模板是 .ejs，可直接手改。
 *
 * 用法:
 *   deno run -A scripts/generate-cover.ts                 # 大图默认(900x383)，用示例数据
 *   deno run -A scripts/generate-cover.ts --big --title "2026年8月跨境资讯汇总" --date "2026.7.26-7.31"
 *   deno run -A scripts/generate-cover.ts --small
 *   deno run -A scripts/generate-cover.ts --out src/temp/cover.png
 */

import ejs from "npm:ejs@3.1.10";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

interface CoverOptions {
  size: "big" | "small";
  title?: string;
  dateRange?: string;
  out?: string;
}

const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const TEMPLATES = {
  big: {
    file: "cover.shazhixing-big.ejs",
    width: 900,
    height: 383,
  },
  small: {
    file: "cover.shazhixing-small.ejs",
    width: 300,
    height: 400,
  },
};

function parseArgs(args: string[]): CoverOptions {
  const options: CoverOptions = { size: "big" };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--big":
        options.size = "big";
        break;
      case "--small":
        options.size = "small";
        break;
      case "--title":
        options.title = args[++i];
        break;
      case "--date":
        options.dateRange = args[++i];
        break;
      case "--out":
        options.out = args[++i];
        break;
      case "--help":
        console.log(`用法:
  deno run -A scripts/generate-cover.ts [options]

选项:
  --big                大图 900x383 (默认)
  --small              小图 300x400
  --title <text>       封面标题 (默认 跨境电商资讯汇总)
  --date <text>        日期区间，如 2026.7.26-7.31
  --out <path>         输出 PNG 路径
  --help               显示帮助
`);
        Deno.exit(0);
    }
  }
  return options;
}

function findEdge(): string {
  for (const candidate of EDGE_CANDIDATES) {
    try {
      if (Deno.statSync(candidate)) return candidate;
    } catch {
      // 继续找下一个
    }
  }
  throw new Error("未找到 Edge，请确认已安装 Microsoft Edge");
}

async function renderTemplate(
  size: "big" | "small",
  cover: Record<string, string>,
): Promise<string> {
  const spec = TEMPLATES[size];
  const templatePath = join(
    Deno.cwd(),
    "src/features/weixin-article/rendering/templates",
    spec.file,
  );
  const template = await Deno.readTextFile(templatePath);
  return ejs.render(template, { cover }, { rmWhitespace: true });
}

async function screenshot(
  edge: string,
  htmlPath: string,
  pngPath: string,
  width: number,
  height: number,
): Promise<void> {
  const url = pathToFileURL(htmlPath).href;
  const cmd = new Deno.Command(edge, {
    args: [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      `--window-size=${width},${height}`,
      "--virtual-time-budget=2000",
      `--screenshot=${pngPath}`,
      url,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stderr } = await cmd.output();
  if (code !== 0) {
    throw new Error(
      `Edge 截图失败 (code=${code}): ${new TextDecoder().decode(stderr)}`,
    );
  }
}

export interface GenerateCoverResult {
  pngPath: string;
  size: "big" | "small";
}

/**
 * 生成封面 PNG（供 run-lite 调用）
 * @param cover 封面内容
 */
export async function generateCoverPng(cover: {
  size?: "big" | "small";
  title?: string;
  dateRange?: string;
  out?: string;
} = {}): Promise<GenerateCoverResult> {
  const size = cover.size ?? "big";
  const edge = findEdge();
  const spec = TEMPLATES[size];

  const today = new Date();
  const maxAgeDays = 5;
  const start = new Date(today.getTime() - maxAgeDays * 86400000);
  const dateRange = cover.dateRange ??
    `${start.getFullYear()}.${start.getMonth() + 1}.${start.getDate()}-${today.getMonth() + 1}.${today.getDate()}`;

  const title = cover.title ?? "跨境电商资讯汇总";

  // 1. 渲染 HTML
  const html = await renderTemplate(size, {
    title,
    dateRange,
  });
  const htmlPath = join(
    Deno.cwd(),
    `src/temp/cover-${size}.html`,
  );
  await Deno.writeTextFile(htmlPath, html);

  // 2. Edge 无头截图
  const pngPath = cover.out ??
    join(Deno.cwd(), `src/temp/cover-${size}.png`);
  await screenshot(edge, htmlPath, pngPath, spec.width, spec.height);

  // 3. 校验尺寸
  const stat = await Deno.stat(pngPath);
  console.log(`封面已生成: ${pngPath} (${spec.width}x${spec.height}, ${stat.size} bytes)`);
  return { pngPath, size };
}

async function main(): Promise<void> {
  const options = parseArgs(Deno.args);
  await generateCoverPng({
    size: options.size,
    title: options.title,
    dateRange: options.dateRange,
    out: options.out,
  });
}

if (import.meta.main) {
  await main();
}
