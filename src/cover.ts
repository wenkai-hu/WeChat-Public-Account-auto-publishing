import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { escapeHtml } from "./utils.ts";

const WIDTH = 900;
const HEIGHT = 383;

export interface CoverOptions {
  title: string;
  dateRange: string;
  outputPath: string;
}

/**
 * 使用已经敲定的迈途国际封面版式生成 HTML。
 * 动态内容只有标题与日期，品牌和视觉样式保持固定。
 */
export function renderCoverHtml(title: string, dateRange: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; background: #002E39; overflow: hidden; }
  .cover { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; background: #002E39; color: #fff; }
  .top-bar { position: absolute; top: 0; left: 0; right: 0; height: 6px; background: #FF7918; }
  .deco-1 { position: absolute; right: -60px; top: -80px; width: 280px; height: 280px; border-radius: 50%; border: 30px solid rgba(255,121,24,0.10); }
  .deco-2 { position: absolute; left: -40px; bottom: -70px; width: 200px; height: 200px; border-radius: 50%; border: 24px solid rgba(255,121,24,0.08); }
  .brand { position: absolute; top: 28px; left: 34px; }
  .brand .en { font-size: 14px; letter-spacing: 3px; color: rgba(255,255,255,0.85); font-weight: 600; }
  .brand .cn { font-size: 11px; letter-spacing: 2px; color: #FF7918; margin-top: 6px; }
  .date { position: absolute; top: 30px; right: 34px; font-size: 15px; letter-spacing: 1px; color: rgba(255,255,255,0.9); font-weight: 600; padding: 6px 14px; border: 1px solid #FF7918; border-radius: 999px; }
  .hero { position: absolute; top: 50%; left: 0; right: 0; transform: translateY(-46%); text-align: center; padding: 0 60px; }
  .hero .label { font-size: 15px; letter-spacing: 6px; color: #FF7918; font-weight: 700; margin-bottom: 18px; }
  .hero .title { font-size: 52px; font-weight: 800; letter-spacing: 3px; line-height: 1.35; text-shadow: 0 2px 12px rgba(0,0,0,0.35); }
  .footer { position: absolute; bottom: 26px; left: 0; right: 0; text-align: center; font-size: 14px; letter-spacing: 4px; color: rgba(255,255,255,0.75); }
  .footer .line { display: inline-block; width: 34px; height: 1px; background: #FF7918; vertical-align: middle; margin: 0 12px; }
</style>
</head>
<body>
  <div class="cover">
    <div class="top-bar"></div>
    <div class="deco-1"></div>
    <div class="deco-2"></div>
    <div class="brand">
      <div class="en">MT GLOBAL WEEKLY NEWS</div>
      <div class="cn">迈途国际</div>
    </div>
    <div class="date">${escapeHtml(dateRange)}</div>
    <div class="hero">
      <div class="label">WEEKLY DIGEST</div>
      <div class="title">${escapeHtml(title)}</div>
    </div>
    <div class="footer"><span class="line"></span>跨境卖家 · 一周资讯汇编<span class="line"></span></div>
  </div>
</body>
</html>`;
}

/** 用本机 Edge 无头模式把固定封面模板截图成 900×383 PNG。 */
export async function generateCoverPng(options: CoverOptions): Promise<string> {
  const edgePath = findEdge();
  const pngPath = resolve(options.outputPath);
  const htmlPath = pngPath.replace(/\.png$/i, ".html");
  await Deno.mkdir(dirname(pngPath), { recursive: true });
  await Deno.writeTextFile(htmlPath, renderCoverHtml(options.title, options.dateRange));

  const command = new Deno.Command(edgePath, {
    args: [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${WIDTH},${HEIGHT}`,
      "--virtual-time-budget=2000",
      `--screenshot=${pngPath}`,
      pathToFileURL(htmlPath).href,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const result = await command.output();
  if (!result.success) {
    const details = new TextDecoder().decode(result.stderr).trim();
    throw new Error(`自动生成封面失败：Edge 退出码 ${result.code}${details ? `，${details}` : ""}`);
  }
  const stat = await Deno.stat(pngPath);
  if (stat.size === 0) throw new Error("自动生成封面失败：PNG 文件为空");
  return pngPath;
}

function findEdge(): string {
  const configured = Deno.env.get("EDGE_PATH")?.trim();
  const candidates = [
    configured,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      if (Deno.statSync(candidate).isFile) return candidate;
    } catch {
      // 继续检查下一个常见安装位置。
    }
  }
  throw new Error("未找到 Microsoft Edge；可在 .env 中通过 EDGE_PATH 指定 msedge.exe 路径");
}
