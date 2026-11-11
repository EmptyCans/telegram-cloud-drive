# Telegram Cloud Drive

在 Cloudflare Workers 上管理 Telegram 频道里的小文件。一个 Worker 同时托管前端和 API。KV 保存站点设置，D1 保存目录、标签、分享令牌和 Telegram 文件映射。

## 从 GitHub 部署

1. 将本目录的文件上传到一个 GitHub 仓库根目录。也可以放在子目录，连接仓库时把根目录设置为对应子目录。
2. 在 Cloudflare 的 **Workers & Pages** 中创建 **Worker**，选择 **Connect to Git**，授权并选择仓库和生产分支。Worker 名称须和 `wrangler.jsonc` 中的 `name` 一致。若已有同名的其他应用，先改成自己的唯一名称。
3. 构建命令可以留空，部署命令用 `npx wrangler deploy`。提交到生产分支后，Workers Builds 会自动重新部署。Wrangler 会创建并绑定 `CONFIG`（KV）和 `DB`（D1）。使用自定义部署 API Token 时，为对应账户授予 Worker 部署、KV 和 D1 编辑权限。首次访问文件管理接口会建表。
4. 在 Worker 的 **Settings → Variables and Secrets** 添加下面三项，类型选 **Secret**。这些是 Worker 运行时的 Secret。
5. 打开部署生成的 `workers.dev` 地址，用 `ADMIN_TOKEN` 登录。上传一张小图，验证站内预览、下载、分享和撤销链接。

| Secret | 值 |
| --- | --- |
| `ADMIN_TOKEN` | 至少 24 个字符的强随机管理员密钥，例如用 `openssl rand -hex 32` 生成 |
| `TELEGRAM_BOT_TOKEN` | 从 Telegram 的 `@BotFather` 获取 |
| `TELEGRAM_STORAGE_CHAT_ID` | 数字频道 ID，例如 `-1001234567890`。将 Bot 加入频道并赋予发布消息权限 |

[Workers Git 部署](https://developers.cloudflare.com/workers/ci-cd/builds/) · [自动创建 KV 和 D1](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning) · [Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## 本地运行

使用 Node.js 22.12 或更新版本。

```sh
npm ci
npm run check
npm run dev
```

先复制 `.dev.vars.example` 为 `.dev.vars` 并填入测试用 Secret。本地 KV 和 D1 由 Wrangler 模拟，状态保存在 `.wrangler/`。上传和下载仍会请求 Telegram，测试时请使用自己的测试频道。部署到 Cloudflare 时使用独立的线上 KV 和 D1。

## 使用与数据

- 默认只允许管理员浏览和操作。文件可以按需生成公开链接，任何拿到链接的人都能访问，撤销后该地址失效。
- 站点名称、描述、上传大小限制在管理界面的「设置」中修改，保存在 KV 的 `site:config` 键。不同地区读到更新后的配置可能有延迟。
- 单文件上限默认 20 MiB，可以调小。这个上限同时考虑了官方 Bot API 的下载能力。站内可预览 JPEG、PNG、GIF、WebP 和 AVIF，其他类型按附件下载。
- 删除目录会递归软删除子项目并撤销其分享链接，Telegram 频道消息会保留。备份 D1 时还需保留相应频道和 Bot 的访问权限。上传先写频道再写 D1，如果这两步之间发生中断，频道里可能有未被索引的文件消息。
- 这是参照原项目重新实现的版本，使用独立数据库和 API。当前包含目录、批量及拖拽上传、下载、图片预览、搜索、标签、分享和站点设置。已有的 Prisma 数据库和外链需要另行迁移。原项目的多存储空间、密码解锁、缩略图、复制和统计功能目前未移植。
