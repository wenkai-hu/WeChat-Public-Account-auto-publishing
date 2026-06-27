//接口规范
//export-接口可以被import使用
//{}内的内容和和java一样可以用修饰符来修饰 public private protected这些
export interface ContentScraper {
  // scarp(url,附选 ?表示非必要) 返回一个ScrapedContent类型的数组
  scrape(sourceId: string, options?: ScraperOptions): Promise<ScrapedContent[]>;
}

export interface ScraperOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  filters?: Record<string, unknown>;
}
//返回数据类型规范 统一字段
export interface ScrapedContent {
  //每一条数据源在源网站数据库中的唯一标识
  id: string;
  title: string;
  content: string;
  url: string;
  publishDate: string;
  media?: Media[];
  metadata: Record<string, unknown>;
}

export interface Media {
  url: string;
  type: string;
  size: Size;
}

export interface Size {
  width: number;
  height: number;
}
