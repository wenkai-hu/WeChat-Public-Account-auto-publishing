import type { AppConfig } from "./types.ts";

function env(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

export function loadConfig(): AppConfig {
  return {
    tavilyApiKey: env("TAVILY_API_KEY"),
    llm: {
      baseUrl: env("LLM_BASE_URL").replace(/\/$/, ""),
      apiKey: env("LLM_API_KEY"),
      model: env("LLM_MODEL"),
    },
    wechat: {
      appId: env("WECHAT_APP_ID"),
      appSecret: env("WECHAT_APP_SECRET"),
      coverPath: env("WECHAT_COVER_PATH") || undefined,
      author: env("WECHAT_AUTHOR") || "迈途国际",
    },
    searchQueries: [
      "site:aboutamazon.com seller news",
      "site:sell.amazon.com global selling",
      "eBay seller announcement",
      "TikTok Shop seller news",
      "Shopee seller announcement",
      "AliExpress seller news",
      "site:sheingroup.com newsroom",
      "Mercado Libre seller news",
      "site:cbp.gov ecommerce customs newsroom",
      "site:europa.eu ecommerce regulation",
    ],
    maxCandidates: 30,
    sourceWindowDays: 5,
    outputDir: "output",
    brand: {
      name: "迈途国际",
      englishName: "MT GLOBAL WEEKLY NEWS",
      slogan: "跨境电商 · 卖家资讯汇编",
      articleHeading: "迈途国际资讯汇总",
      aboutHeading: "ABOUT MT GLOBAL",
      aboutImageUrl:
        "https://mmbiz.qpic.cn/sz_mmbiz_png/0ibUxoKuTmtZusj6JGDrOXsHy0HH0Fl8WdCwbfjjg5Eonprk2YCSJhZgo2R8FFwsG09U7GQRM4uicotOSDol2gibTTYsKWXDvtVDiaF0MvGXQsg/640?wx_fmt=png&from=appmsg",
      aboutParagraphs: [
        "迈途国际商务（MT Global）是一家为国内中小企业提供出海服务的机构，以香港公司注册及商务秘书服务为基础，开拓欧美日、东南亚、南美等国家的公司注册、银行开户、年审审计、知识产权、ODI备案，FDI备案，企业出海咨询等服务，拥有数十名资深企业顾问和专业会计师团队，立足国内，辐射全球，让生意无国界，让创业更简单！",
        "迈途深耕出海服务10年，专业团队实时更新与您切身相关的资讯，帮助企业解决全球出海和跨境运营的烦恼，防范各阶段的风险，提供稳定境外架构搭建，合规手续办理服务。我们一直以来致力于为您提供更专业、更高效、更可靠的服务，为您带来更有价值的商务服务体验。",
      ],
      contactImageUrl:
        "https://mmbiz.qpic.cn/mmbiz_png/0ibUxoKuTmtYGSDk80X7MlwssTaee3WibUu2FXk9iaHicnfqLQaXGsWDsiaXhxI1B5VNk16bQO8U4knH3dDBdhVibgnVbIPpicEjVP03oFP6leImLI/640?wx_fmt=png&from=appmsg",
      contactText: "如需了解更多出海资讯，欢迎联系我们迈途国际客服，扫描下方二维码添加好友",
      primaryColor: "#002E39",
      accentColor: "#FF7918",
    },
  };
}

export function validateConfig(config: AppConfig, command: "preview" | "publish"): void {
  const missing: string[] = [];
  if (!config.tavilyApiKey) missing.push("TAVILY_API_KEY");
  if (!config.llm.baseUrl) missing.push("LLM_BASE_URL");
  if (!config.llm.apiKey) missing.push("LLM_API_KEY");
  if (!config.llm.model) missing.push("LLM_MODEL");
  if (command === "publish") {
    if (!config.wechat.appId) missing.push("WECHAT_APP_ID");
    if (!config.wechat.appSecret) missing.push("WECHAT_APP_SECRET");
  }
  if (missing.length > 0) {
    throw new Error(`缺少配置：${missing.join("、")}。请复制 .env.example 为 .env 后填写。`);
  }
}
