# 封面图片

正常情况下不需要手动准备封面。发布时，程序会根据本期标题和日期区间，用固定 HTML/CSS 模板自动生成 900×383 PNG，再上传到微信公众号素材库。

只有需要临时覆盖自动封面时，才把 JPG 或 PNG 放在本目录，并在 `.env` 的 `WECHAT_COVER_PATH` 中填写路径。

示例：

```dotenv
WECHAT_COVER_PATH=assets/cover.jpg
```

封面图片可能包含品牌素材或个人信息，因此默认文件名已加入 `.gitignore`，不会被提交。
