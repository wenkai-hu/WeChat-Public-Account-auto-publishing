export interface SourceArticle {
  id: string;
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  score?: number;
}

export interface BriefItem {
  title: string;
  summary: string;
  sourceIndex: number;
}

export interface BriefCategory {
  name: string;
  items: BriefItem[];
}

export interface NewsBrief {
  title: string;
  categories: BriefCategory[];
}

export interface AppConfig {
  tavilyApiKey: string;
  llm: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  wechat: {
    appId: string;
    appSecret: string;
    /** 可选；为空时根据本期标题和日期自动生成品牌封面。 */
    coverPath?: string;
    author: string;
  };
  searchQueries: string[];
  maxCandidates: number;
  sourceWindowDays: number;
  outputDir: string;
  brand: {
    name: string;
    englishName: string;
    slogan: string;
    articleHeading: string;
    aboutHeading: string;
    aboutImageUrl: string;
    aboutParagraphs: string[];
    contactImageUrl: string;
    contactText: string;
    primaryColor: string;
    accentColor: string;
  };
}
