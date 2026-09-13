import assert from "node:assert/strict";
import { renderCoverHtml } from "../src/cover.ts";
import { parseNewsBrief } from "../src/llm.ts";
import { renderWechatArticle } from "../src/render.ts";
import { searchTavily } from "../src/tavily.ts";
import type { AppConfig, NewsBrief, SourceArticle } from "../src/types.ts";

Deno.test("Tavily 搜索结果会转换成统一资讯结构", async () => {
  const fakeFetch: typeof fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          results: [{ title: "Seller News", url: "https://example.com/news", content: "detail" }],
        }),
        { status: 200 },
      ),
    );
  const results = await searchTavily("seller news", "test-key", 4, fakeFetch);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Seller News");
});

Deno.test("大模型 JSON 会校验来源编号", () => {
  const brief = parseNewsBrief(
    JSON.stringify({
      title: "周报",
      categories: [{
        name: "平台",
        items: [
          { title: "有效", summary: "摘要", sourceIndex: 1 },
          { title: "无效", summary: "摘要", sourceIndex: 9 },
        ],
      }],
    }),
    2,
  );
  assert.equal(brief.categories[0].items.length, 1);
});

Deno.test("微信 HTML 转义模型文本并保留来源链接", () => {
  const sources: SourceArticle[] = [{
    id: "1",
    title: "source",
    url: "https://example.com/a?x=1&y=2",
    snippet: "source",
  }];
  const brief: NewsBrief = {
    title: "周报 <script>",
    categories: [{
      name: "平台动态",
      items: [{ title: "标题", summary: "摘要 <script>alert(1)</script>", sourceIndex: 1 }],
    }],
  };
  const brand: AppConfig["brand"] = {
    name: "品牌",
    englishName: "WEEKLY NEWS",
    slogan: "跨境资讯",
    articleHeading: "品牌资讯汇总",
    aboutHeading: "ABOUT US",
    aboutImageUrl: "https://example.com/about.png",
    aboutParagraphs: ["介绍一", "介绍二"],
    contactImageUrl: "https://example.com/contact.png",
    contactText: "联系客服",
    primaryColor: "#002E39",
    accentColor: "#FF7918",
  };
  const result = renderWechatArticle(
    brief,
    sources,
    brand,
    5,
    new Date("2026-08-01T12:00:00+08:00"),
  );
  assert.match(result.previewHtml, /&lt;script&gt;/);
  assert.match(result.previewHtml, /https:\/\/example\.com\/a\?x=1&amp;y=2/);
  assert.match(result.previewHtml, /品牌资讯汇总/);
  assert.match(
    result.previewHtml,
    /<title>2026年8月第一周跨境电商资讯汇总<\/title>/,
  );
  assert.match(result.previewHtml, /2026年8月第一周（7月27日-8月1日）/);
  assert.match(result.previewHtml, /以下是我们/);
  assert.match(result.previewHtml, /【平台动态】摘要/);
  assert.doesNotMatch(
    result.previewHtml,
    /font-size:13px;font-weight:bold;letter-spacing:2px;line-height:1.5;">平台动态/,
  );
  assert.match(result.previewHtml, /https:\/\/example\.com\/about\.png/);
  assert.match(result.previewHtml, /https:\/\/example\.com\/contact\.png/);

  const septemberResult = renderWechatArticle(
    brief,
    sources,
    brand,
    5,
    new Date("2026-09-12T12:00:00+08:00"),
  );
  assert.match(septemberResult.previewHtml, /2026年9月第二周（9月7日-12日）/);
});

Deno.test("封面模板只替换标题和日期并保留固定品牌版式", () => {
  const html = renderCoverHtml("2026年8月第一周跨境电商资讯汇总", "2026.7.27-8.1");
  assert.match(html, /width: 900px; height: 383px/);
  assert.match(html, /MT GLOBAL WEEKLY NEWS/);
  assert.match(html, /WEEKLY DIGEST/);
  assert.match(html, /2026年8月第一周跨境电商资讯汇总/);
  assert.match(html, /2026\.7\.27-8\.1/);
  assert.match(html, /跨境卖家 · 一周资讯汇编/);
});
