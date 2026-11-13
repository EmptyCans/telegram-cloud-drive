# Telegram Cloud Drive

基于 Cloudflare Workers 和 Telegram Bot API 的轻量网盘。文件保存在 Telegram 频道，目录、文件索引和分享记录保存在 Cloudflare D1，站点设置保存在 Workers KV。

- 管理端支持目录树、列表和网格、搜索、排序、标签、批量移动和删除。
- 支持选择、拖放和粘贴上传。文件夹上传保留目录结构，单文件默认上限为 20 MiB，可在站点设置中调低。
- 文件和目录可以生成同域短链接，支持有效期和撤销。公开目录访客可以浏览、下载、上传和新建文件夹。
- 浏览器可以预览常见图片、音频、视频，以及 PDF、HTML、Markdown、TXT、DOCX 和 XLSX。媒体能否播放取决于浏览器支持的编码。

## 从 GitHub 部署

1. Fork 仓库。在 Cloudflare 的 **Workers & Pages** 中创建 Worker，选择 **Connect to Git**，授权并选择自己的仓库和生产分支。
2. Worker 名称应和 `wrangler.jsonc` 的 `name` 一致。仓库根目录包含该文件时，项目根目录使用默认值。
3. 构建命令留空，部署命令使用 `npx wrangler deploy`。Wrangler 会执行配置中的预览构建，并自动创建或复用绑定的 KV（`CONFIG`）和 D1（`DB`）。
4. 在生产 Worker 的 **Settings → Variables and Secrets** 中添加以下运行时密钥并部署。
5. 打开生产地址，使用管理员密钥登录。在同一个目录上传小文件并创建分享，用无痕窗口验证浏览、下载和访客上传。

| 密钥 | 如何填写 |
| --- | --- |
| `ADMIN_TOKEN` | 自行生成的随机管理员密钥，至少 8 个字符 |
| `TELEGRAM_BOT_TOKEN` | 从 Telegram 的 `@BotFather` 获取 |
| `TELEGRAM_STORAGE_CHAT_ID` | Telegram 频道的数字 ID，例如 `-1001234567890`。将 Bot 加入频道并授予发布消息权限 |

Fork 部署使用部署者自己的 D1、KV、Bot 和频道。目录记录和密钥需在自己的部署中配置。

[Cloudflare Git 部署](https://developers.cloudflare.com/workers/ci-cd/builds/) · [自动创建 KV 和 D1](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning) · [Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## 本地开发

使用 Node.js 22.12 或更新版本。将 `.dev.vars.example` 复制为 `.dev.vars`，填入测试用密钥。

```sh
npm ci
npm run check
npm run dev
```

本地 D1 和 KV 由 Wrangler 模拟，状态保存在 `.wrangler/`。上传和下载会实际请求 Telegram，请使用测试频道。运行 `npm run deploy -- --dry-run` 可以检查部署构建。

## 技术文档

见[架构、API、数据模型和运维说明](docs/architecture.md)。

## 许可证

本项目使用 [MIT License](LICENSE)。项目参考了 [AndySkaura/mifun-storage](https://github.com/AndySkaura/mifun-storage) 的 Telegram 频道存储思路，并为 Cloudflare Workers 实现了独立的数据库和接口。
