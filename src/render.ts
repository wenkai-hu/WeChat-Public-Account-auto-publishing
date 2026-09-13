import type { AppConfig, NewsBrief, SourceArticle } from "./types.ts";
import { escapeHtml } from "./utils.ts";

export interface RenderedArticle {
  title: string;
  digest: string;
  contentHtml: string;
  previewHtml: string;
}

/**
 * 按已经敲定的迈途国际/沙之星版式渲染。
 * 固定品牌文案和结构完全由模板控制，AI 只提供资讯标题与摘要。
 */
export function renderWechatArticle(
  brief: NewsBrief,
  sources: SourceArticle[],
  brand: AppConfig["brand"],
  sourceWindowDays = 5,
  now = new Date(),
): RenderedArticle {
  const articles = brief.categories.flatMap((category) =>
    category.items.map((item) => ({
      title: item.title,
      content: withCategoryPrefix(category.name, item.summary),
      source: sources[item.sourceIndex - 1],
    }))
  );
  const periodEnd = now;
  const periodStart = new Date(periodEnd.getTime() - sourceWindowDays * 86_400_000);
  const weekNames = ["一", "二", "三", "四", "五", "六"];
  const weekName = weekNames[Math.floor((periodEnd.getDate() - 1) / 7)] ?? "五";
  const primary = escapeHtml(brand.primaryColor);
  const accent = escapeHtml(brand.accentColor);

  const contentsHtml = articles.map((article, index) =>
    `<p style="margin:0 0 10px;color:#ffffff;font-size:15px;letter-spacing:0.5px;line-height:1.7;"><span style="color:${accent};font-weight:bold;">${
      twoDigits(index + 1)
    }</span>&nbsp;&nbsp;${escapeHtml(article.title)}</p>`
  ).join("\n");

  const articleSectionsHtml = articles.map((article, index) => {
    const paragraphs = article.content.split(/\n{2,}|\n/).map((value) => value.trim()).filter(
      Boolean,
    );
    return `<section style="background-color:${primary};margin:0;padding:0 0 10px;">
<section style="display:flex;flex-flow:row;background-color:${accent};transform:translate3d(38px,0,0);">
<section style="width:22%;text-align:center;align-self:center;box-sizing:border-box;">
<p style="margin:0;padding:0;color:#ffffff;font-size:40px;font-weight:bold;line-height:1.2;">${
      twoDigits(index + 1)
    }</p>
</section>
<section style="width:56%;text-align:center;align-self:center;box-sizing:border-box;">
<p style="margin:0;padding:0 20px;color:#ffffff;font-size:17px;font-weight:bold;letter-spacing:3px;line-height:1.5;">ARTICLE ${
      twoDigits(index + 1)
    }</p>
</section>
<section style="width:22%;text-align:center;align-self:center;box-sizing:border-box;">
<p style="margin:0;padding:0;color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">✦</p>
</section>
</section>
<section style="margin:0;padding:20px 14px 24px;border:2px solid #ffffff;background-color:${primary};">
<p style="margin:0 0 18px;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:1px;line-height:1.5;">${
      escapeHtml(article.title)
    }</p>
${
      paragraphs.map((paragraph) =>
        `<section style="margin:0 0 16px;color:#ffffff;font-size:14px;letter-spacing:0.5px;line-height:2;text-align:justify;">
${escapeHtml(paragraph)}
</section>`
      ).join("\n")
    }
${article.source?.url ? sourceLink(article.source.url) : ""}
</section>
</section>`;
  }).join(
    `\n<p style="background-color:${primary};margin:0;padding:24px 14px;color:rgba(255,255,255,0.6);font-size:15px;letter-spacing:0.5px;text-align:center;line-height:1.2;"><b style="font-weight:bold;letter-spacing:0.5px;">-----------------------------------------</b></p>\n`,
  );

  const aboutParagraphsHtml = brand.aboutParagraphs.map((paragraph, index) =>
    `<p style="margin:0${
      index < brand.aboutParagraphs.length - 1 ? " 0 12px" : ""
    };color:#ffffff;font-size:14px;letter-spacing:0.5px;line-height:2;text-align:justify;">${
      escapeHtml(paragraph)
    }</p>`
  ).join("\n");

  const contentHtml =
    `<section style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;background-color:${primary};box-sizing:border-box;font-style:normal;font-weight:400;text-align:justify;color:#3E3E3E;margin:0;padding:0;">

<section style="background-color:${primary};margin:0;padding:26px 14px 20px;">
<section style="text-align:center;margin:0 0 18px;">
<p style="margin:0 0 12px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:1px;line-height:1.4;opacity:0.92;">${
      escapeHtml(brand.englishName)
    }</p>
<section style="display:block;width:100%;padding:8px 0;background-color:rgba(255,255,255,0.33);">
<p style="margin:0;color:#ffffff;font-size:36px;font-weight:bold;letter-spacing:1px;text-align:center;line-height:1.3;">${
      escapeHtml(brand.articleHeading)
    }</p>
</section>
</section>

<section style="margin:22px 0 6px auto;width:90%;padding:6px 14px;text-align:right;border-left:1px dashed #ffffff;border-right:1px solid #ffffff;letter-spacing:2px;line-height:2;">
<p style="margin:0;color:#ffffff;font-weight:bold;font-size:16px;letter-spacing:0.5px;">${
      formatDotRange(periodStart, periodEnd)
    }</p>
<p style="margin:0;color:#ffffff;font-weight:bold;font-size:15px;letter-spacing:0.5px;">${
      escapeHtml(brand.slogan)
    }</p>
</section>
<p style="margin:0;color:#ffffff;font-size:15px;letter-spacing:0.5px;text-align:right;line-height:1.2;"><b style="font-weight:bold;letter-spacing:0.5px;">-----------------------------------------</b></p>
</section>

<section style="background-color:${primary};margin:0;padding:2px 14px 0;">
<p style="margin:0 0 12px;color:#ffffff;font-size:15px;letter-spacing:0.5px;line-height:1.9;"><span style="background-color:${accent};color:#ffffff;font-weight:bold;padding:0 2px;">${periodEnd.getFullYear()}年${
      periodEnd.getMonth() + 1
    }月第${weekName}周（${
      formatChineseRange(periodStart, periodEnd)
    }）</span>，跨境电商领域又产生了哪些重要信息？</p>
<p style="margin:0 0 16px;color:#ffffff;font-size:15px;letter-spacing:0.5px;line-height:1.9;">以下是我们<span style="background-color:${accent};color:#ffffff;font-weight:bold;padding:0 2px;">${
      escapeHtml(brand.name)
    }</span>为各位卖家朋友带来的一周资讯汇总：</p>
</section>

<section style="background-color:${primary};margin:0;padding:0 14px 14px;">
<section style="padding:18px 16px;border:2px solid #ffffff;background-color:${primary};">
<p style="margin:0 0 2px;color:${accent};font-size:14px;font-weight:bold;letter-spacing:3px;line-height:1.4;">本期资讯目录</p>
<p style="margin:0 0 14px;color:rgba(255,255,255,0.7);font-size:12px;letter-spacing:2px;line-height:1.4;">CONTENTS</p>
${contentsHtml}
</section>
</section>

${articleSectionsHtml}

<!-- 关于迈途国际 -->
<section style="background-color:${primary};margin:0;padding:0 14px 14px;">
<section style="padding:18px 14px;border:2px solid #ffffff;background-color:${primary};">
<p style="margin:0 0 2px;color:${accent};font-size:14px;font-weight:bold;letter-spacing:3px;line-height:1.4;">关于${
      escapeHtml(brand.name)
    }</p>
<p style="margin:0 0 14px;color:rgba(255,255,255,0.7);font-size:12px;letter-spacing:2px;line-height:1.4;">${
      escapeHtml(brand.aboutHeading)
    }</p>
<img src="${
      escapeHtml(brand.aboutImageUrl)
    }" style="width:100%;height:auto;display:block;margin:0 0 16px;border-radius:4px;" />
${aboutParagraphsHtml}
</section>
</section>

<!-- 联系客服 -->
<section style="background-color:${primary};margin:0;padding:0 14px 24px;">
<section style="padding:18px 14px;border:2px solid ${accent};text-align:center;">
<p style="margin:0 0 14px;color:#ffffff;font-size:15px;letter-spacing:1px;line-height:2;">${
      escapeHtml(brand.contactText)
    }</p>
<img src="${
      escapeHtml(brand.contactImageUrl)
    }" style="width:180px;height:auto;display:block;margin:0 auto;border-radius:4px;" />
</section>
</section>

<p style="background-color:${primary};margin:0;padding:26px 14px 16px;color:rgba(255,255,255,0.6);font-size:15px;letter-spacing:0.5px;text-align:right;line-height:1.2;"><b style="font-weight:bold;letter-spacing:0.5px;">-----------------------------------------</b></p>
<section style="background-color:${primary};margin:0;padding:0 14px 24px;">
<section style="padding:18px 14px;border:2px solid #ffffff;text-align:center;">
<p style="margin:0;color:#ffffff;font-size:14px;letter-spacing:1px;line-height:2;">如果你觉得内容不错，欢迎分享转发<br/><span style="color:rgba(255,255,255,0.8);font-size:12px;letter-spacing:0.5px;">本内容仅供参考，不构成业务建议</span></p>
</section>
</section>
</section>`;

  const title = buildWeeklyTitle(sourceWindowDays, now);
  const digest = articles.map((article) => article.title).join("，").slice(0, 120);
  const previewHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body>
${contentHtml}
</body>
</html>`;

  return { title, digest, contentHtml, previewHtml };
}

export function buildWeeklyTitle(sourceWindowDays = 5, now = new Date()): string {
  // 封面、草稿标题和正文周次都按发布日命名；正文括号内仍显示完整资讯区间。
  void sourceWindowDays;
  const weekNames = ["一", "二", "三", "四", "五", "六"];
  const weekName = weekNames[Math.floor((now.getDate() - 1) / 7)] ?? "五";
  return `${now.getFullYear()}年${now.getMonth() + 1}月第${weekName}周跨境电商资讯汇总`;
}

export function buildCoverDateRange(sourceWindowDays = 5, now = new Date()): string {
  const periodStart = new Date(now.getTime() - sourceWindowDays * 86_400_000);
  return formatDotRange(periodStart, now);
}

function withCategoryPrefix(category: string, summary: string): string {
  const trimmed = summary.trim();
  return trimmed.startsWith("【") ? trimmed : `【${category.trim()}】${trimmed}`;
}

function sourceLink(url: string): string {
  const safe = escapeHtml(url);
  return `<section style="margin:18px 0 0;padding:10px 12px;border:1px solid rgba(255,255,255,0.5);font-size:13px;color:rgba(255,255,255,0.9);word-break:break-all;line-height:1.8;">
原文链接：<a href="${safe}" style="color:#FFB366;text-decoration:none;">${safe}</a>
</section>`;
}

function formatDotRange(start: Date, end: Date): string {
  const startText = `${start.getFullYear()}.${start.getMonth() + 1}.${start.getDate()}`;
  const endYear = end.getFullYear() === start.getFullYear() ? "" : `${end.getFullYear()}.`;
  return `${startText}-${endYear}${end.getMonth() + 1}.${end.getDate()}`;
}

function formatChineseRange(start: Date, end: Date): string {
  const startText = `${start.getMonth() + 1}月${start.getDate()}日`;
  const endMonth = end.getMonth() === start.getMonth() ? "" : `${end.getMonth() + 1}月`;
  return `${startText}-${endMonth}${end.getDate()}日`;
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}
