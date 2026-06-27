//根据url判断走哪个爬虫器 输出对应的字符串用于后续的判断逻辑
//输入一个url(X.com)返回一个字符串("twitter")
import {
  ProviderAdapter,
  ProviderRegistry,
} from "@src/registry/provider-registry.ts";
import {
  FetchProviderName,
  ResolvedTrendPublishConfig,
} from "@src/utils/config/define-config.ts";
import { ScraperType } from "@src/integrations/fetch/scraper-type.ts";

export type FetchProviderId = Exclude<FetchProviderName, "auto">;
export type SearchFetchProviderId = Extract<
  FetchProviderId,
  | "jina-search"
  | "brave-search"
  | "tavily-search"
  | "exa-search"
  | "serper-search"
  | "newsapi"
  | "gdelt"
  | "hackernews"
  | "arxiv"
>;

const searchFetchProviders = new Set<FetchProviderId>([
  "jina-search",
  "brave-search",
  "tavily-search",
  "exa-search",
  "serper-search",
  "newsapi",
  "gdelt",
  "hackernews",
  "arxiv",
]);

export interface FetchProviderAdapter
  extends ProviderAdapter<ResolvedTrendPublishConfig, FetchProviderId> {
  scraperType: ScraperType;
  matches(url: URL): boolean;
}

export const fetchProviderRegistry = new ProviderRegistry<
  ResolvedTrendPublishConfig,
  FetchProviderAdapter
>();

fetchProviderRegistry.register({
  id: "twitter",
  kind: "fetch",
  scraperType: ScraperType.TWITTER,
  isConfigured: (config) =>
    Boolean(
      config.providers.fetch.twitter.bearerToken ||
        config.providers.fetch.twitter.xquikApiKey,
    ),
  matches: (url) =>
    url.hostname === "x.com" ||
    url.hostname.endsWith(".x.com") ||
    url.hostname === "twitter.com" ||
    url.hostname.endsWith(".twitter.com"),
});

fetchProviderRegistry.register({
  id: "rss",
  kind: "fetch",
  scraperType: ScraperType.RSSHUB,
  isConfigured: () => true,
  matches: (url) =>
    url.hostname.includes("rsshub") ||
    url.pathname.endsWith(".rss") ||
    url.pathname.endsWith(".xml"),
});

fetchProviderRegistry.register({
  id: "jina",
  kind: "fetch",
  scraperType: ScraperType.JINA_READER,
  isConfigured: (config) => Boolean(config.providers.fetch.jina.apiKey),
  matches: () => false,
});

fetchProviderRegistry.register({
  id: "jina-search",
  kind: "fetch",
  scraperType: ScraperType.JINA_SEARCH,
  isConfigured: (config) => Boolean(config.providers.fetch.jina.apiKey),
  matches: () => false,
});

fetchProviderRegistry.register({
  id: "brave-search",
  kind: "fetch",
  scraperType: ScraperType.BRAVE_SEARCH,
  isConfigured: (config) => Boolean(config.providers.fetch.brave.apiKey),
  matches: () => false,
});

fetchProviderRegistry.register({
  id: "tavily-search",
  kind: "fetch",
  scraperType: ScraperType.TAVILY_SEARCH,
  isConfigured: (config) => Boolean(config.providers.fetch.tavily.apiKey),
  matches: () => false,
});

fetchProviderRegistry.register({
  id: "exa-search",
  kind: "fetch",
  scraperType: ScraperType.EXA_SEARCH,
  isConfigured: (config) => Boolean(config.providers.fetch.exa.apiKey),
  matches: () => false,
});

fetchProviderRegistry.register({
  id: "serper-search",
  kind: "fetch",
  scraperType: ScraperType.SERPER_SEARCH,
  isConfigured: (config) => Boolean(config.providers.fetch.serper.apiKey),
  matches: () => false,
});

fetchProviderRegistry.register({
  id: "newsapi",
  kind: "fetch",
  scraperType: ScraperType.NEWSAPI,
  isConfigured: (config) => Boolean(config.providers.fetch.newsapi.apiKey),
  matches: () => false,
});

fetchProviderRegistry.register({
  id: "gdelt",
  kind: "fetch",
  scraperType: ScraperType.GDELT,
  isConfigured: () => true,
  matches: () => false,
});

fetchProviderRegistry.register({
  id: "hackernews",
  kind: "fetch",
  scraperType: ScraperType.HACKERNEWS,
  isConfigured: () => true,
  matches: () => false,
});

fetchProviderRegistry.register({
  id: "arxiv",
  kind: "fetch",
  scraperType: ScraperType.ARXIV,
  isConfigured: () => true,
  matches: () => false,
});

fetchProviderRegistry.register({
  id: "aboutamazon",
  kind: "fetch",
  scraperType: ScraperType.ABOUTAMAZON,
  isConfigured: () => true,
  matches: (url) =>
    url.hostname === "aboutamazon.com" ||
    url.hostname.endsWith(".aboutamazon.com"),
});

fetchProviderRegistry.register({
  id: "firecrawl",
  kind: "fetch",
  scraperType: ScraperType.FIRECRAWL,
  isConfigured: (config) => Boolean(config.providers.fetch.firecrawl.apiKey),
  matches: () => true,
});

export function inferFetchProvider(url: string): FetchProviderId {
  const parsed = new URL(url);
  const matched = fetchProviderRegistry
    .list()
    .find((adapter) => adapter.matches(parsed));
  if (!matched) {
    throw new Error(`无法推断数据源抓取 provider: ${url}`);
  }
  //最终输出
  return matched.id;
}

export function isSearchFetchProvider(
  provider: string,
): provider is SearchFetchProviderId {
  return searchFetchProviders.has(provider as FetchProviderId);
}
