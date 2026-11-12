# 自动同步上游并部署

[`sync-upstream.yml`](workflows/sync-upstream.yml) 每小时第 17 分钟检查一次上游，也可以在 GitHub 的 **Actions → Sync upstream → Run workflow** 中立即执行。定时运行可能因 GitHub 排队稍有延迟。

工作流调用 GitHub 自带的 fork 同步接口，将父仓库的同名分支合并到当前仓库的默认分支。对于此 fork，即 `innboom/telegram-cloud-drive:main` → `EmptyCans/telegram-cloud-drive:main`。有更新就直接合并，不需要创建 PR 或逐次批准；没有更新则不会创建新提交。同步采用合并方式，保留此工作流和 fork 中已有的独立修改。

## 首次启用

1. 将工作流提交并推送到 GitHub 默认分支 `main`。
2. 打开 fork 的 **Actions** 页面；如果显示启用提示，点击 **I understand my workflows, go ahead and enable them**。
3. 选择 **Sync upstream → Run workflow**，确认首次运行成功。工作流已声明 `contents: write`，使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需添加个人访问令牌或 Cloudflare Secret。
4. 保持 Cloudflare Worker 连接此 fork 的生产分支 `main`，开启自动构建，部署命令使用 `npx wrangler deploy`。同步产生提交后，Cloudflare Workers Builds 会自动构建部署，可在 Cloudflare 的构建记录中查看结果。

## 运行说明

- 同步结果显示在 Actions 运行摘要中。若发生合并冲突或分支规则禁止直接写入，工作流会失败；解决相应问题后重新运行即可。
- GitHub 会停用连续 60 天没有仓库活动的公共仓库定时工作流。如果上游长期不更新，之后需要在 **Actions → Sync upstream** 中重新启用。仅定时执行检查不保证避免停用。
- 当前部署由 Cloudflare 的 Git 集成触发。如果以后改为另一个监听 `push` 的 GitHub Actions 部署工作流，需要额外调整触发方式：`GITHUB_TOKEN` 产生的推送不会自动触发另一个 `push` 工作流。

[GitHub fork 同步接口](https://docs.github.com/en/rest/branches/branches#sync-a-fork-branch-with-the-upstream-repository) · [定时工作流规则](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) · [Cloudflare GitHub 自动部署](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/) · [工作流间触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)
