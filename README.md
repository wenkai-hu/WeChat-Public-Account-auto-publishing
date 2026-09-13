# 跨境资讯自动发布

一个小型、独立、可以从头读完的 TypeScript 项目：输入跨境电商搜索关键词，通过 Tavily 获取近一周资讯，让大模型完成筛选、分类和摘要，渲染成微信公众号兼容的品牌 HTML，最后生成本地预览或创建公众号草稿。

## 完整流程

```text
跨境关键词
    │
    ▼
Tavily Search ── 限定近一周、深度搜索
    │
    ▼
URL 去重 ── 清理追踪参数、按发布时间排序
    │
    ▼
大模型 ── 价值筛选、分类、中文摘要、来源编号
    │
    ▼
HTML 渲染 ── 品牌色、目录、分节、原文链接、微信内联样式
    │
    ├── preview：保存本地 HTML
    │
    └── publish：模板自动生成封面 PNG → 上传封面 → 创建微信公众号草稿
```

## 项目结构

```text
gzh_auto_publish/
├─ .env.example          # 密钥配置样例，真实 .env 不提交
├─ deno.json             # sample / preview / publish / check / test 命令
├─ README.md             # 项目说明与复盘入口
├─ assets/
│  └─ README.md          # 正式发布使用的本地封面说明
├─ src/
│  ├─ cli.ts             # 命令行入口，明确区分预览和发布
│  ├─ config.ts          # 关键词、品牌信息和环境变量
│  ├─ pipeline.ts        # 五步业务流程编排
│  ├─ tavily.ts          # Tavily 近一周资讯搜索与去重
│  ├─ llm.ts             # 大模型筛选、分类、摘要与 JSON 校验
│  ├─ render.ts          # 微信兼容的品牌正文 HTML 模板
│  ├─ cover.ts           # 900×383 封面模板与 Edge 自动截图
│  ├─ wechat.ts          # access_token、封面上传、草稿创建
│  ├─ types.ts           # 管线数据结构
│  └─ utils.ts           # HTML 转义、URL 标准化、产物写入
└─ tests/
   └─ pipeline_test.ts   # 搜索转换、AI 结果校验和渲染测试
```

阅读顺序建议：`pipeline.ts` → `tavily.ts` → `llm.ts` → `render.ts` → `wechat.ts`。核心流程只有这五个文件。

## 开始运行

安装 Deno 2.x，然后进入本目录：

```bash
cd gzh_auto_publish
```

先运行完全离线的示例，检查目录和版式：

```bash
deno task sample
```

单独检查本期自动封面：

```bash
deno task cover
```

它会在 `output/sample-时间/` 中生成三个可展示的中间产物：

- `01-sources.json`：搜索得到的原始资讯结构
- `02-brief.json`：大模型整理后的结构化简报
- `03-article.html`：最终公众号文章预览

如果只修改了模板，可以直接使用已有搜索和 AI 结果重新渲染，不会重复调用 API：

```bash
deno task rerender output/某次运行目录
```

## 配置真实服务

复制配置样例：

```powershell
Copy-Item .env.example .env
```

填写以下内容：

| 配置                | 作用                                   | preview 是否需要 | publish 是否需要 |
| ------------------- | -------------------------------------- | ---------------- | ---------------- |
| `TAVILY_API_KEY`    | 搜索近一周资讯                         | 是               | 是               |
| `LLM_BASE_URL`      | OpenAI 兼容接口地址，通常以 `/v1` 结尾 | 是               | 是               |
| `LLM_API_KEY`       | 大模型密钥                             | 是               | 是               |
| `LLM_MODEL`         | 模型名称                               | 是               | 是               |
| `WECHAT_APP_ID`     | 公众号 AppID                           | 否               | 是               |
| `WECHAT_APP_SECRET` | 公众号 AppSecret                       | 否               | 是               |
| `WECHAT_COVER_PATH` | 可选手动封面；留空时自动生成           | 否               | 否               |

真实密钥只放在 `.env`，该文件已被 `.gitignore` 忽略。

## 本地预览

```bash
deno task preview --max-candidates 20
```

该命令会完成搜索、去重、AI 整理和模板渲染，但不会调用微信 API。

## 创建公众号草稿

先检查生成的 HTML，再显式执行：

```bash
deno task publish --max-candidates 20
```

发布时会把“本期周报标题”和“日期区间”填进固定封面模板，调用本机 Edge 无头模式生成 `04-cover.png`，然后自动上传封面并创建草稿，不需要手工上传图片。发布流程不会自动群发。公众号后台需要把运行机器的公网 IP 加入白名单。

## 修改关键词和品牌

- 搜索关键词：`src/config.ts` 中的 `searchQueries`
- 候选数量：`src/config.ts` 中的 `maxCandidates`，也可用命令参数覆盖
- 固定标题、公司图片、公司介绍、客服二维码和颜色：`src/config.ts` 中的 `brand`
- 公众号封面版式：`src/cover.ts`
- AI 筛选标准：`src/llm.ts` 中的 system prompt
- 页面布局：`src/render.ts`

## 质量与安全设计

- Tavily 请求限定 `time_range: "week"`，聚焦一周资讯。
- 相同 URL 会先标准化并去重，常见追踪参数不会造成重复收录。
- 大模型被要求只能依据搜索素材写作，并返回 `sourceIndex`。
- 程序会校验来源编号，越界内容不会进入文章。
- 所有模型文本在渲染前进行 HTML 转义。
- AI 分类只作为正文开头的 `【分类】` 标签，不会改变模板层级或增加独立小标题。
- 默认使用 preview；只有显式执行 publish 才会接触公众号。
- 微信凭证和 API Key 不写入代码或运行产物。
