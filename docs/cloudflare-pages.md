# Cloudflare Pages 发布

当前网页版由浏览器本地编辑、保存草稿、生成 `.workout` 文件，再由用户打开系统分享。没有服务端接口、D1、Pages Functions 或独立 Worker，也不需要 Apple 开发者账号。已有 `kairos` Worker 不作为这次发布目标。

## 推荐：Git 集成

Git 集成部署以远端生产分支的代码为准，本地未推送的改动不会进入构建。以下为配置方法；当前站点的实际发布方式与部署提交，以 Cloudflare 项目记录为准。

需要用户在 Cloudflare 中完成 GitHub 登录与仓库授权：

1. 进入 **Workers & Pages**，创建 **Pages** 项目，选择导入现有 Git 仓库，而不是创建 Worker。
2. 授权 Cloudflare GitHub 集成访问 `The-V-Factor/Kairos`，选中该仓库。项目名可用 `kairos-web`，以实际可用名称为准。
3. 填写以下配置，确认后部署。

| 设置 | 值 |
| --- | --- |
| 生产分支 | `main` |
| 框架预设 | `None` |
| 根目录 | 仓库根目录，保持空白 |
| 构建命令 | `node tools/package-web.mjs dist` |
| 构建输出目录 | `dist` |
| 环境变量 | `NODE_VERSION=22` |

不需要安装 npm 依赖，也不需要填写 Worker 发布命令或数据库绑定。`dist/` 已忽略；脚本要求输出目录不存在，避免删除或覆盖未知文件。Pages 的干净构建可直接运行，重复本机打包时另指定新目录。

Git 集成会在匹配分支推送后自动构建和发布。可在项目构建设置中将预览部署限制到需要的分支，避免无关原生 App 分支产生网页预览。开启自动部署后，后续向生产分支推送等同于触发上线，应继续遵守仓库发布授权约定。

4. 把生成的 HTTPS 地址用于验收，检查实际 Wi-Fi 与蜂窝网络。自定义域名可后续添加；不从 `pages.dev` 的名称推定国内所有网络均可访问。

依据：[Cloudflare Git 集成](https://developers.cloudflare.com/pages/get-started/git-integration/)、[构建配置](https://developers.cloudflare.com/pages/configuration/build-configuration/)。

## 可选：上传预构建目录

如果明确选择独立的 Direct Upload 项目，可把打包目录或 ZIP 上传到该 Pages 项目。ZIP 根目录必须直接是 `index.html`、脚本及 `assets/`，不要额外套一个 `web/` 或 `dist/` 目录。

Git 集成和 Direct Upload 是不同的项目创建方式，不能直接互相切换。已有 Git 集成项目不能在控制台拖拽上传，但可使用 Wrangler 发布。长期迭代建议选上面的 Git 集成，不要为一次预览误选项目类型。[官方上传说明](https://developers.cloudflare.com/pages/get-started/direct-upload/)

```sh
rtk proxy node tools/package-web.mjs /private/tmp/kairos-pages-新的目录名
```

打包白名单共 11 个文件：`index.html`、`style.css`、`app.mjs`、`plan.mjs`、`ruler.mjs`、`artwork.mjs`、`workout.mjs`、`share.mjs`、`_headers`、`NOTICE.txt`、`assets/app-icon.svg`。不包含测试、Swift 工具或本地签名配置。

## 发布后验收

- 页面和所有模块正常加载，`.mjs` 返回 JavaScript 内容类型，无 CSP 错误；响应保留 `_headers` 中的 CSP 和 `web-share=(self)`。
- 用 iPhone Safari 编辑计划、刷新恢复、增加／修改／删除及撤销，检查 0 公里和终点，确认其他点没有前移。
- 用真实点击分享文件，在面板选择“健身”，核对预览、添加到配对手表并在系统训练启动；网页的分享返回值不能替代设备结果。
- 记录手机、手表及系统版本，分别记录分段提示、声音／触感和终点后继续骑行。双指缩放、减少动态效果、大字号及实际手感继续在真机检查。
- 如果网络或浏览器不支持直接分享，帮助中保留下载路径，单独记录兼容性结果。

草稿保存在当前域名的 localStorage。换域名、清理浏览器数据或使用不同浏览器不会自动迁移；导入系统的计划也不会自动被网页撤回。

## 回滚与当前状态

出问题时在 Pages 部署列表选择上一个已通过验收的版本进行回滚；没有上一版本时，先修复或暂停发布。回滚页面不删除浏览器草稿，也不会自动删除已经导入手表的训练。

2026-11-11：用户已部署 [Kairos 网页](https://kairos-2rm.pages.dev/)，并确认手机可以打开网页、下载训练内容，同意本阶段验收收口。该反馈不等于已验证直接分享至“健身”、导入真实 Apple Watch 或骑行提醒。

Agent 此前访问该域名时遇到 Cloudflare Access 认证入口，自动审批拒绝继续访问；未绕过认证，也未独立确认线上资源与本地版本一致、响应头或所用提交。具体部署方式、部署 ID、设备及系统版本未提供，不作推定。代码提交与合并记录见 #5 对应 PR。不要把本地模拟器输出的示例 `CF_PAGES_URL` 当成已发布地址。
