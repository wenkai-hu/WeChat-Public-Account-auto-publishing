import type { SourceArticle } from "./types.ts";
import { normalizeUrl } from "./utils.ts";

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string | null;
  score?: number;
  published_date?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

export async function searchTavily(
  query: string,
  apiKey: string,
  maxResults = 6,
  fetchImpl: typeof fetch = fetch,
): Promise<SourceArticle[]> {
  const response = await fetchImpl("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      topic: "news",
      time_range: "week",
      max_results: Math.max(1, Math.min(maxResults, 10)),
      include_answer: false,
      include_raw_content: false,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    const hint = response.status === 401 ? "，请检查 TAVILY_API_KEY 是否有效" : "";
    throw new Error(`Tavily 请求失败：HTTP ${response.status}${hint}`);
  }

  let payload: TavilyResponse;
  try {
    payload = JSON.parse(text) as TavilyResponse;
  } catch {
    throw new Error("Tavily 返回了无法解析的数据");
  }

  return (payload.results ?? []).flatMap((item) => {
    if (!item.title?.trim() || !item.url?.trim()) return [];
    return [{
      id: crypto.randomUUID(),
      title: item.title.trim(),
      url: item.url.trim(),
      snippet: (item.raw_content || item.content || "").trim(),
      publishedAt: item.published_date,
      score: item.score,
    }];
  });
}

export async function collectWeeklyNews(
  queries: string[],
  apiKey: string,
  onProgress: (message: string) => void = () => {},
): Promise<SourceArticle[]> {
  const collected: SourceArticle[] = [];

  // 控制并发，避免一次发送过多 Tavily 请求。
  for (let start = 0; start < queries.length; start += 2) {
    const batch = queries.slice(start, start + 2);
    const results = await Promise.allSettled(
      batch.map(async (query) => {
        onProgress(`搜索：${query}`);
        return await searchTavily(query, apiKey);
      }),
    );
    const authFailure = results.find((result) =>
      result.status === "rejected" && errorMessage(result.reason).includes("HTTP 401")
    );
    if (authFailure?.status === "rejected") {
      throw authFailure.reason;
    }
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result.status === "fulfilled") {
        collected.push(...result.value);
      } else {
        onProgress(`跳过失败关键词：${batch[index]}（${errorMessage(result.reason)}）`);
      }
    }
  }

  const seen = new Set<string>();
  return collected
    .filter((article) => {
      const key = normalizeUrl(article.url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => dateValue(b.publishedAt) - dateValue(a.publishedAt));
}

function dateValue(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
