# 纯网页训练文件与界面验证

技术实验 [Issue #4](https://github.com/The-V-Factor/Kairos/issues/4) 已按用户验收通过 PR #6 合并；后续 [Issue #5](https://github.com/The-V-Factor/Kairos/issues/5) 对齐 App UI 并准备 Pages 发布。目标是不安装自有 iPhone / Watch App，不使用苹果开发者账号或重签，把网页计划作为数据文件交给系统“健身／体能训练”。

## 当前范围

当前已完成 B「节奏」网页编辑界面：全程融入标题，单层距离尺可浏览、缩放并显示已有补给；右上角加补给打开「补给主角」面板，水默认“喝水”，胶默认“吃胶”，自定义另填名称。支持 0 米和终点，单点增改删与撤销不改变其余点的位置；主页面浏览不直接修改已有点。

草稿保存在当前域名的 localStorage（kairos.web.plan.v1），包含计划和点位的稳定 ID、补给类型、自定义名称与累计位置；刷新恢复，取消面板不保存。首次打开为可编辑的 75 km 示例。无法读取旧草稿时不自动覆盖，帮助中可明确选择替换；保存失败会提示，并保留当前可分享计划。

本轮只迁移 B，不提供其他四套皮肤或系统排程历史；不伪造网页无法读取的设备状态。原有 iPhone 源码及 README 未改动。设计对照见 docs/design.md，发布步骤见 [Cloudflare Pages](cloudflare-pages.md)。

## 文件与分享

`web/workout.mjs` 使用无依赖 JavaScript 写入 protobuf 二进制，输出真正的 WorkoutPlan `.workout`；仅支持本产品需要的户外骑行、单次 work block、米制距离目标、开放末段和中文分段名称。字段参考 [DotnetWorkoutKit](https://github.com/changeforan/DotnetWorkoutKit/tree/0978caf9deafeafa3d371daab6f216376a0ec31f)，许可说明位于 `web/NOTICE.txt`。

这不是 Apple 公开承诺稳定的跨平台文件规范；必须用实际 Apple 解析器和目标设备验证。当前字段为 WorkoutPlan UUID 9、自定义训练 11、版本 1000=1、格式 1002=5。未用不支持的 JSON 形式替换二进制，也未将文件伪装成其他类型绕过分享限制。

累计里程转换复用原生语义：提醒放在到点后开始的下一段；0 米作为初始段名称，不生成零距离目标；尾段骑到计划全程，之后是开放完成段。精度也一致：公里量级按 100 m，不足一公里按 0.1 m 取整，取整重合要求合并。

页面随输入在内存中准备 File，后缀 `.workout`、MIME `application/octet-stream`。分享按钮点击后直接调用 `navigator.share({files: [file]})`，没有先下载、fetch 或异步生成；不额外分享 URL／文字。`canShare` 仅表示浏览器允许分享，不表示“健身”可用。

分享成功返回只说明交给系统，不表示导入或手表接收。取消保留表单；拒绝和不支持有明确状态。折叠的测试信息记录文件、环境和分享错误类别，不包含补给内容。下载按钮只作对照，不以下载成功替代直接分享验收。

修改及草稿恢复复用计划 UUID。导入时实际是覆盖还是新增、如何删除旧项，尚待真机记录；稳定 UUID 不等于系统一定覆盖旧导入项。

## 静态托管

当前计算和文件生成都在浏览器，无接口、账号、D1、配对码或服务端计算。**优先用 Cloudflare Pages 静态托管**；已有 Worker 不需要为了这个实验被覆盖。

Pages＋D1 并不意味着浏览器直连数据库。未来需要持久化时可用 Pages Functions → D1，或 Pages 静态 → 独立 Worker → D1；绑定与凭据留在服务端。Pages Functions 本身使用 Workers 运行时。域名／线路的可达性应实测，不能从产品名称保证国内访问。

本次没有创建 Cloudflare 项目、连接数据库或执行远端部署。用户提供的 `kairos` Worker 后台地址只是候选资源，不是最终前端访问地址。需要先确定 Pages 项目和可访问的 HTTPS 域名，再取得明确部署授权。

## 本机运行与打包

网页无 npm 依赖，Node.js 22 可运行测试与打包；Python 3 可提供本机静态预览：

```sh
rtk proxy python3 -m http.server 8787 --bind 127.0.0.1 --directory web
rtk proxy node --test web/test/*.test.mjs
rtk proxy node tools/package-web.mjs
```

打包工具输出一个新建的 `/private/tmp/kairos-file-share-<时间>/` 目录，当前包含 11 个发布文件，排除测试和工具源码。也可传入新目录，例如 Git 集成使用 `node tools/package-web.mjs dist`。预构建目录上传方式无需另执行构建；Git 集成的构建参数详见 Pages 文档。`_headers` 设置 CSP 和 `web-share=(self)` 等策略；保留该文件及 NOTICE。

`127.0.0.1` 是访问设备自身：Mac 和模拟器可用本机预览，真实 iPhone 不能用这个地址访问 Mac。局域网普通 HTTP 不满足 Web Share 安全环境要求，真机用实际 HTTPS 地址；不要通过忽略证书警告作为验证步骤。

## Apple 独立互操作验证

`tools/generate-workout-fixtures.mjs` 生成七种不同输入及 JavaScript 编码文件。开发用 `tools/verify-workout.swift` 使用 Apple WorkoutKit 解码，并和现有 `FuelPlan.workoutPlan` 产生的完整对象比较，包括 UUID、骑行类型、目标、单位和所有中文名称；还检查 Apple 重新编码后可再次读入。

这只是 macOS 开发工具，不是用户端 App，不安装程序到手机／手表、不申请排程权限，也不需要开发者账号。Apple Silicon Mac、macOS 15+ 和 Xcode SDK 下运行：

```sh
rtk proxy node tools/generate-workout-fixtures.mjs /private/tmp/kairos-workout-interop
rtk proxy swiftc -target arm64-apple-macos15.0 -module-cache-path /private/tmp/kairos-file-module-cache KairosCore/FuelPlan.swift KairosCore/PlanDistance.swift KairosCore/WorkoutPlanBuilder.swift tools/verify-workout.swift -o /private/tmp/kairos-verify-workout
rtk proxy /private/tmp/kairos-verify-workout /private/tmp/kairos-workout-interop
rtk proxy swift format lint --strict tools/verify-workout.swift
```

## #4 实验取得的证据（2026-11-10）

- 10 项 Node 行为测试通过：分段语义、删除保留绝对位置、出发／终点、尾段、精度、非法值、二进制、同步调用分享、取消和拒绝。
- 发布工具只打包 8 个静态文件，生成可供 Pages 上传的目录／压缩包，排除测试和工具源码。本地 Wrangler Pages 模拟器已解析 `_headers` 并返回 HTTP 200，CSP、`web-share=(self)` 和其他响应头可读取；不涉及远端部署。
- 七种 JS 文件全部通过真实 Apple WorkoutKit 精确对象比较：出发＋终点、出发单点、终点单点、尾段、小数米、公里取整、长中文及 emoji。
- 在桌面内嵌浏览器操作表单，验证自定义 75 km 计划、删除中间点保留 75 km 终点、新增点、未填完整禁止导出；下载的实际 263 字节文件也用 Apple 框架核对，与页面 0／25／70／75 km 输入相等。合计八份文件通过互操作验证。
- iPhone 17e **模拟器**、iOS 26.5 系统 Safari：打开本地页面，直接点击“分享训练”弹出系统分享面板，显示训练文件图标及“Apple Watch · 259 字节”，没有先保存到文件。取消后表单保留且不宣称导入成功。
- 同一模拟器的“更多”App 列表为空，无法验证“健身”目标及实际 Watch 导入。
- 桌面内嵌浏览器 `canShare` 返回 true，但实际分享返回 `NotAllowedError`（点击激活为 true）。这是真实环境限制，不将其记录为成功；系统 Safari 模拟器测试单独记录。

![iOS 模拟器 Safari 直接分享训练文件](assets/screenshots/web-file-share-ios.png)

## #5 界面与发布包验证（2026-11-10）

- `rtk proxy node --test web/test/*.test.mjs`：17 项通过。新增验证草稿读写保留 ID／类型／自定义名、单点移动及删除撤销、出发与终点、空草稿、缩短全程边界、取整重合、异常存储保留原文、距离解析和刻度间隔。
- 402×874 及 320×740 浏览器布局检查：首页、默认提示、手改后切类型不覆盖、取消不保存；新增 0 公里及 75 公里终点香蕉，修改中点 31.6→45 公里，删除与撤销，不移动其他点；刷新恢复全部输入。测试后移除临时点，恢复原示例。
- 实际水平拖动已露出红色删除按钮，再点按删除及撤销通过；没有整段滑动直接删除。缩放按钮保留精确游标，程序定位不受整数像素量化影响。
- 新网页实际下载的 286 字节文件，经 Apple WorkoutKit 与原生对象完整比较通过，含 0／14.5／45／51.1／75 km 及终点自定义“吃香蕉”。合计 9 个互操作案例通过；编码器协议未改。
- iPhone 17e / iOS 26.5 模拟器系统 Safari，在本地 Pages 发布包检查首页、默认类型不自动唤键盘、自定义软键盘与表单可见性；修正视口平移造成的键盘遮挡，关闭后背景恢复。
- 同一模拟器实际点击新版“分享训练到健身”，直接打开 .workout 分享面板，显示“Apple Watch · 268 字节”；取消后保留计划并明确显示未完成，未虚报接收成功。
- `node tools/package-web.mjs dist` 本机首次构建通过，最终发布包只含 11 个文件且 ZIP 完整性检查通过。Wrangler 本地 Pages 模拟器返回 200，CSP、web-share 权限及 JS 内容类型可核对；没有 Functions 或 D1，也未创建远端资源。
- 真实手指连续拖动／双指缩放、减少动态效果与极大字号的设备验收，以及真实 Watch 导入与提醒仍待测，不把鼠标／模拟器结果当成真机手感。

| Safari 模拟器软键盘 | 新版直接系统分享 |
| --- | --- |
| ![自定义补给键盘](assets/screenshots/web-keyboard-ios.jpg) | ![直接分享训练文件](assets/screenshots/web-share-ios.jpg) |

## 用户线上验收（2026-11-11）

用户提供部署地址 https://kairos-2rm.pages.dev/，并确认“手机能打开网页，并且下载训练内容”，据此同意 #5 本阶段验收并要求代码提交合并。此处记录用户提供的真机结果，不把下载成功当成直接分享、“健身”导入或 Watch 骑行提醒通过。手机／系统版本、线上部署提交及资源一致性未核验；这些设备验证仍保留为后续边界。

## 真机门槛（尚未通过）

1. 真实 iPhone Safari 打开待确认的 HTTPS 测试地址，填写实际设备与系统版本。
2. 点“分享训练”，确认不经过手动下载即出现分享面板。
3. 确认“健身”目标出现，系统预览的户外骑行、中文分段名称与页面一致，确认添加到配对 Apple Watch。
4. 在系统“体能训练”找到并启动，分别记录到点文字、声音／触感、0 米、终点之后继续骑行。
5. 修改后重新分享，观察覆盖／新增及旧项删除行为；没有回执的状态不推定成功。

若直接分享不支持或没有“健身”目标，保存本次测试信息与截图。可下载文件作独立对照，但不能把备用路径当成主流程通过，更不能擅自回到自有原生 App 方案。
