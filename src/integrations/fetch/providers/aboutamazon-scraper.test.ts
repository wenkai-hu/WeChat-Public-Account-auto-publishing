import { assertEquals } from "@std/assert";
import { AboutAmazonScraper } from "./aboutamazon-scraper.ts";

Deno.test("AboutAmazonScraper 集成测试 - 抓取 aboutamazon 新闻", async () => {
  const scraper = new AboutAmazonScraper();
  const results = await scraper.scrape("aboutamazon", { limit: 3 });

  assertEquals(results.length, 3, "应返回 3 条结果");

  for (const r of results) {
    console.log(`[${r.id}] ${r.title.slice(0, 60)}... | ${r.publishDate}`);

    assertEquals(r.id.startsWith("aboutamazon_"), true, `ID 格式错误`);
    assertEquals(r.title.length > 0, true, "标题不应为空");
    assertEquals(r.url.includes("aboutamazon.com"), true, `URL 异常`);
    assertEquals(r.content.length > 0, true, "内容不应为空");
    assertEquals(r.metadata.source, "aboutamazon");
    assertEquals(r.metadata.provider, "aboutamazon");
  }
});
