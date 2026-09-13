import type { AppConfig, BriefCategory, NewsBrief, SourceArticle } from "./types.ts";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function createNewsBrief(
  articles: SourceArticle[],
  config: AppConfig["llm"],
  fetchImpl: typeof fetch = fetch,
): Promise<NewsBrief> {
  if (articles.length === 0) throw new Error("没有可交给大模型整理的资讯");

  const sourceText = articles.map((article, index) => {
    const date = article.publishedAt ? `发布日期：${article.publishedAt}\n` : "";
    return `[${index + 1}] ${article.title}\n${date}来源：${article.url}\n${
      article.snippet.slice(0, 900)
    }`;
  }).join("\n\n---\n\n");

  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是一名严谨的跨境电商周报编辑。你的读者是跨境卖家和外贸从业者。

筛选重点：
- 电商平台规则、费用、工具与卖家政策
- 税务、海关、知识产权和跨境合规
- 物流仓储、支付、区域市场和消费趋势
- 能直接影响卖家经营决策的信息

排除泛宏观评论、软文和无法从素材验证的内容。只允许使用用户给出的素材，不得补写未知事实。

只返回 JSON：
{
  "title": "YYYY年M月第X周跨境电商资讯汇总",
  "categories": [
    {
      "name": "分类名",
      "items": [
        { "title": "资讯标题", "summary": "1-3 段中文摘要", "sourceIndex": 1 }
      ]
    }
  ]
}`,
        },
        {
          role: "user",
          content:
            `请从以下 ${articles.length} 条近一周素材中筛选最有价值的内容，分类并摘要：\n\n${sourceText}`,
        },
      ],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`大模型请求失败：HTTP ${response.status}`);
  }

  let payload: ChatCompletionResponse;
  try {
    payload = JSON.parse(text) as ChatCompletionResponse;
  } catch {
    throw new Error("大模型接口返回了无法解析的数据");
  }

  const raw = payload.choices?.[0]?.message?.content ?? "";
  return parseNewsBrief(raw, articles.length);
}

export function parseNewsBrief(raw: string, sourceCount: number): NewsBrief {
  const cleaned = raw.replace(/^\uFEFF/, "").replace(/^```(?:json)?/i, "").replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("大模型没有返回 JSON 对象");

  let value: unknown;
  try {
    value = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("大模型返回的 JSON 格式不正确");
  }
  if (!isRecord(value) || typeof value.title !== "string" || !Array.isArray(value.categories)) {
    throw new Error("大模型返回结果缺少 title 或 categories");
  }

  const categories: BriefCategory[] = value.categories.flatMap((category) => {
    if (
      !isRecord(category) || typeof category.name !== "string" || !Array.isArray(category.items)
    ) {
      return [];
    }
    const items = category.items.flatMap((item) => {
      if (!isRecord(item) || typeof item.title !== "string" || typeof item.summary !== "string") {
        return [];
      }
      const sourceIndex = Number(item.sourceIndex);
      if (!Number.isInteger(sourceIndex) || sourceIndex < 1 || sourceIndex > sourceCount) return [];
      return [{ title: item.title.trim(), summary: item.summary.trim(), sourceIndex }];
    }).filter((item) => item.title && item.summary);
    return items.length > 0 ? [{ name: category.name.trim() || "行业动态", items }] : [];
  });

  if (categories.length === 0) throw new Error("大模型没有选出可用资讯");
  return { title: value.title.trim() || "跨境电商资讯汇总", categories };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
