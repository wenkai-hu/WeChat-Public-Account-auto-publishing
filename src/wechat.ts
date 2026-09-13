export interface WechatPublishConfig {
  appId: string;
  appSecret: string;
  coverPath: string;
  author: string;
}

interface WechatError {
  errcode?: number;
  errmsg?: string;
}

export async function publishWechatDraft(
  article: { title: string; digest: string; contentHtml: string },
  config: WechatPublishConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const token = await getAccessToken(config.appId, config.appSecret, fetchImpl);
  const coverMediaId = await uploadCover(token, config.coverPath, fetchImpl);
  const response = await fetchImpl(tokenUrl("/cgi-bin/draft/add", token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      articles: [{
        title: article.title,
        author: config.author,
        digest: article.digest,
        content: article.contentHtml,
        thumb_media_id: coverMediaId,
        need_open_comment: 0,
        only_fans_can_comment: 0,
      }],
    }),
  });
  const payload = await readWechatJson(response, "创建公众号草稿");
  const mediaId = typeof payload.media_id === "string" ? payload.media_id : "";
  if (!mediaId) throw new Error("微信没有返回草稿 media_id");
  return mediaId;
}

async function getAccessToken(
  appId: string,
  appSecret: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);
  const response = await fetchImpl(url);
  const payload = await readWechatJson(response, "获取微信 access_token");
  const token = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!token) throw new Error("微信没有返回 access_token");
  return token;
}

async function uploadCover(
  accessToken: string,
  coverPath: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const bytes = await Deno.readFile(coverPath);
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("封面图片不能超过 10MB");
  const extension = coverPath.toLowerCase().split(".").pop();
  if (!extension || !["jpg", "jpeg", "png"].includes(extension)) {
    throw new Error("封面图片只支持 JPG 或 PNG");
  }
  const mime = extension === "png" ? "image/png" : "image/jpeg";
  const form = new FormData();
  form.append("media", new Blob([bytes], { type: mime }), `cover.${extension}`);
  const response = await fetchImpl(
    `${tokenUrl("/cgi-bin/material/add_material", accessToken)}&type=image`,
    { method: "POST", body: form },
  );
  const payload = await readWechatJson(response, "上传微信封面");
  const mediaId = typeof payload.media_id === "string" ? payload.media_id : "";
  if (!mediaId) throw new Error("微信没有返回封面 media_id");
  return mediaId;
}

function tokenUrl(path: string, accessToken: string): string {
  const url = new URL(path, "https://api.weixin.qq.com");
  url.searchParams.set("access_token", accessToken);
  return url.href;
}

async function readWechatJson(
  response: Response,
  action: string,
): Promise<Record<string, unknown>> {
  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw new Error(`${action}失败：微信返回了无法解析的数据`);
  }
  const error = payload as WechatError;
  if (!response.ok || (error.errcode && error.errcode !== 0)) {
    const whitelistHint = error.errcode === 40164 ? "；请把当前公网 IP 加入公众号白名单" : "";
    throw new Error(
      `${action}失败：${error.errcode ?? response.status} ${error.errmsg ?? ""}${whitelistHint}`,
    );
  }
  return payload;
}
