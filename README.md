# 迈途国际资讯自动发布系统

一个针对 **"迈途国际"微信公众号** 的自动化资讯生产实践项目：用 **Tavily 搜索**跑我预先写好的跨境电商关键词，抓取结果后交给 **AI 筛选与整理**，自动填入仿照公众号原风格的 **"沙之星跨境" 模板**，最后**投递到微信公众号草稿箱**，人工确认后一键发布。

> 基于开源项目 [TrendPublish](https://github.com/liyown/ai-trend-publish)（MIT）二次开发。上游项目功能很多，本项目只聚焦并深度改造了一条链路：**微信跨境资讯周报自动生成与发布**。

---

## 一、完整工作流

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  ① 关键词配置  │ →  │  ② Tavily搜索 │ →  │  ③ 抓取与去重  │ →  │ ④ AI 筛选     │
│  跨境电商关键词  │    │  近一周深度搜索 │    │  标题/摘要/URL │    │  选题/打分/决策 │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                               │
                                                               ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ ⑦ 微信草稿箱   │ ←  │ ⑥ 质量门禁+发布 │ ←  │ ⑤ 沙之星模板   │ ←  │ ④ AI 整理     │
│ /cgi-bin/    │    │  封面上传/审稿  │    │  shazhixing   │    │  文章计划/起草  │
│ draft/add    │    │               │    │  .ejs 渲染    │    │  /标题        │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### ① 配置关键词（数据源）

在 `trendpublish.config.ts` 中把跨境资讯关键词写成 `search:` 前缀的数据源。当前配置覆盖了主流跨境电商平台与政策来源：

```ts
features: {
  article: {
    sources: [
      "search:site:aboutamazon.com seller news",   // 亚马逊
      "search:eBay seller announcement 2026",       // eBay
      "search:TikTok Shop seller news",             // TikTok
      "search:Shopee seller announcement",          // Shopee
      "search:AliExpress seller news",              // 速卖通
      "search:site:sheingroup.com newsroom",        // SHEIN
      "search:Mercado Libre seller news",           // 美客多
      "search:site:cbp.gov newsroom",               // 美国海关
      "search:site:europa.eu ecommerce regulation", // 欧盟法规
    ],
  },
},
```

这些 `search:` 数据源通过抓取分组路由到搜索服务：

```ts
fetchGroups: {
  search: ["tavily-search", "gdelt", "hackernews", "arxiv"],
},
```

### ② Tavily 搜索

`search:` 数据源被 [article-fetch-planner.ts](src/app/weixin-article/fetch/article-fetch-planner.ts) 解析后，由 [tavily-search-scraper.ts](src/integrations/fetch/providers/tavily-search-scraper.ts) 调用 Tavily Search API：

- `POST https://api.tavily.com/search`，`search_depth: "advanced"`（深度搜索）
- `time_range: "week"` —— 只取近一周资讯，保证"周报"时效性
- 每个关键词返回 4~8 条结果，含标题、URL、摘要、发布时间

### ③ 抓取与去重

`WeixinArticleContentScrapeService` 统一抓取所有数据源，产出带来源 URL 的结构化内容；随后按内容做去重，避免多平台重复转载混进同一期周报。

### ④ AI 筛选

抓取到的几十条资讯不会全收，由三个 AI 环节逐层筛选：

| 环节                                 | 作用                                       |
| ------------------------------------ | ------------------------------------------ |
| 选题聚类 `plan-editorial-topics`     | 把内容聚成主题、逐个评分，找出"今日主线"   |
| 内容排序 `rank-contents`             | LLM 给每条内容按价值打分，只保留排名靠前的 |
| 编辑决策 `decide-editorial-strategy` | 决定本期主线、收录哪些、跳过低价值内容     |

筛选口径由自定义的 `crossborder` 提示词画像（[prompt-profile.ts](src/prompts/prompt-profile.ts)）控制：**只关心跨境电商平台规则、外贸合规/税务政策、物流仓储、市场信号，能直接指导卖家经营的信息；排除泛宏观评论和软文**。

### ⑤ AI 整理

通过筛选的资讯进入"写作"环节：

- `plan-article` —— 生成文章结构（分章节、排顺序）
- `draft-article-content` —— AI 起草正文，按 `crossborder` 口径写成"谁、什么时间、什么事、影响什么"的简短资讯
- `generate-title` —— 生成「2026年7月第X周跨境电商资讯汇总」风格的汇总标题

### ⑥ 填入"沙之星跨境"模板

渲染环节使用自定义的 **shazhixing 模板**（[article.shazhixing.ejs](src/features/weixin-article/rendering/templates/article.shazhixing.ejs)），完全复刻沙之星公众号的原版视觉风格：

- 深蓝底 `#002E39` + 品牌橙 `#FF7918`
- 顶部大 Banner「WEEKLY NEWS / 跨境资讯汇总」+ 日期
- 「本期资讯目录 CONTENTS」导航区
- 每条资讯以橙色横条编号 `ARTICLE 01` 分节，正文带原文链接

模板渲染产出**微信兼容的 HTML**（内联样式清洗）。封面图优先走 AI 生图，失败时回退到已上传素材库的默认沙之星封面；另有 [generate-cover.ts](scripts/generate-cover.ts) 用 Edge 无头浏览器把封面 EJS 模板渲染成 PNG（900×383 大图 / 300×400 小图）。

### ⑦ 质量门禁与投递草稿箱

- `review-article-quality`：LLM 按质量门禁审稿（≥80 分、无事实硬伤才放行），不达标自动触发最多 2 轮定向修订
- `publish-article`：通过后由 `WeixinPublisher` 依次调用微信公众号 API：
  1. `GET access_token`
  2. 校验服务器 IP 白名单
  3. 上传封面素材 `POST /cgi-bin/material/add_material`
  4. 创建草稿 `POST /cgi-bin/draft/add`

最终文章进入公众号**草稿箱**（`dryRun: false`），人工在公众号后台确认后发布——AI 只负责生产，最终发布权留给人。

---

## 二、我做的改装（相对上游）

1. **新增 `shazhixing` 模板**：根据真实公众号文章 HTML 逆向复刻视觉风格，写成可手改的 EJS 模板（`article.shazhixing.ejs` + 封面模板）
2. **新增 `crossborder` 提示词画像**：让 AI 的筛选和写作口径完全贴合跨境电商资讯场景
3. **配置关键词数据源 + Tavily 搜索链路**：打通"关键词 → 搜索 → 抓取"的发现环节
4. **封面体系**：AI 生图 + Edge 无头渲染本地封面 + 默认封面三级方案
5. **跑通真实发布**：`dryRun: false` 下完成素材上传与草稿投递

---

## 三、技术栈

| 领域     | 选型                                                |
| -------- | --------------------------------------------------- |
| 运行时   | Deno + TypeScript（全项目零构建依赖，直接运行）     |
| 搜索引擎 | Tavily Search API（深度搜索、近一周）               |
| 大模型   | 火山方舟 GLM（OpenAI 兼容接口，用于筛选/整理/审稿） |
| 发布平台 | 微信公众号开放平台 API（素材 + 草稿箱）             |
| 模板引擎 | EJS（微信内联样式 HTML）                            |
| 本地存储 | SQLite + JSON（运行记录、去重）                     |

---

## 四、快速开始

```bash
# 0.本项目启动方式
deno run -A scripts/run-lite.ts --no-dry-run
# 1. 安装 Deno v2+
# Windows
irm https://deno.land/install.ps1 | iex

# 2. 准备配置（LLM、Tavily、微信 AppID/AppSecret）
cp trendpublish.config.example.ts trendpublish.config.ts

# 3. 检查配置
deno task doctor

# 4. 本地试跑（只生成 HTML，不投递草稿）
deno task article --dry-run

# 5. 真实运行：搜索→筛选→整理→渲染→投递到公众号草稿箱
deno task article

# 6. 单独预览沙之星模板效果
deno task preview

# 7. 生成封面 PNG（Edge 无头渲染）
deno run -A scripts/generate-cover.ts --big --title "2026年8月跨境资讯汇总"
```

> 最小配置只需三样：一个 LLM 凭证、一个 Tavily API Key、微信公众号 `appId` / `appSecret`。

---

## 五、核心文件速览

```
trendpublish.config.ts                        # 关键词数据源 / Tavily 路由 / shazhixing 模板开关
src/integrations/fetch/providers/tavily-search-scraper.ts   # Tavily 搜索适配器
src/features/weixin-article/services/content-scrape.service.ts  # 数据源抓取编排
src/features/weixin-article/workflow.ts       # 主工作流（7 个环节的编排与产物落盘）
src/prompts/prompt-profile.ts                 # crossborder 内容画像（我新增）
src/features/weixin-article/rendering/templates/article.shazhixing.ejs   # 沙之星正文模板（我新增）
src/features/weixin-article/rendering/templates/cover.shazhixing-*.ejs   # 沙之星封面模板（我新增）
src/integrations/publish/providers/weixin-publisher.ts   # 微信公众号素材上传 + 草稿投递
scripts/generate-cover.ts                     # Edge 无头渲染封面 PNG
reference/                                    # 逆向参考：真实文章 HTML + 封面图
```

---

## 六、说明

本项目从开源项目二次开发而来，**保留了上游大量当前未使用的模块**（Cloudflare Serverless 部署、多公众号矩阵、向量去重、FireCrawl / Exa / Serper 等多数据源、Dashboard 前端等），本次只使用了上面描述的主链路及沙之星定制部分。密钥全部保存在 `.gitignore` 忽略的本地 `trendpublish.config.ts` 中，不会进入版本库。
