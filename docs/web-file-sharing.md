# 纯网页训练文件与界面验证

技术实验 [Issue #4](https://github.com/The-V-Factor/Kairos/issues/4) 已按用户验收通过 PR #6 合并；后续 [Issue #5](https://github.com/The-V-Factor/Kairos/issues/5) 对齐 App UI 并准备 Pages 发布。目标是不安装自有 iPhone / Watch App，不使用苹果开发者账号或重签，把网页计划作为数据文件交给系统“健身／体能训练”。

## 当前范围

当前主线为纯 Web，骑行提醒闭环已由用户验收。网页提供五套皮肤：全程融入标题，单层距离尺可浏览、缩放并显示已有补给；右上角加补给打开「补给主角」面板，水默认“喝水”，胶默认“吃胶”，自定义另填名称。支持 0 米和终点，单点增改删与撤销不改变其余点的位置；主页面浏览不直接修改已有点。

首页采用“标题合一”：计划名称是唯一主标题，点标题进入统一计划面板，新建与名称／日期／全程编辑共用一条入口。月历在面板内展开，公里滚轮每格 1 km，保留直接输入与旧小数距离；选择器展开时隐藏次要操作以控制高度。

计划库保存在当前域名的 localStorage（`kairos.web.library.v1`）。支持多计划命名、骑行日期、复制、切换、删除与最近一次撤销；包含计划和点位的稳定 ID、补给类型、自定义名称与累计位置。刷新恢复当前计划，取消面板不保存。首次打开为可编辑的 75 km 示例；旧 `kairos.web.plan.v1` 单草稿迁移一次，保留 ID 和内容，不覆盖旧键。删除最后一份后保持空库，不重新迁移或自动填充示例。

导出历史按骑行日期分组，保存名称、日期、全程和补给点快照。下载只记录“请求下载”；系统分享只有 handed-off 才记录，取消或失败不记。完全相同的版本再次导出更新最近时间和方式，内容或名称／日期变化另留一版。编辑、重命名、删除当前计划不改历史；历史可复制为新计划，计划与点位都生成新 ID。日期仅用于本机整理，不是系统训练排程。

外观偏好独立保存。浏览器不读取系统排程、设备接收或运动完成状态，历史也不能撤回手表计划。计划与历史一起写入一个存储文档；损坏／未知版本不会自动覆盖，可临时编辑下载，在帮助中明确重建。写入失败显示提示，不声称已经保存。没有备份、恢复或云同步。设计见 [界面设计](design.md)，发布见 [Cloudflare Pages](cloudflare-pages.md)。

后文按时间保留各轮实验结果，以当前范围和最新记录为准；旧记录中的“未验证”不再作为用户已验收闭环的阻塞项。

2026-11-11 本地回归：全程输入改为数字末尾光标；普通单指点按不再触发距离尺的缩放结束重绘；皮肤入口可打开五套选择面板。`rtk proxy node --test --test-reporter=dot web/test/*.test.mjs` 的 36 项测试通过，涵盖点按与缩放结束的区别、皮肤独立保存、未知值及存储拒绝。402×874 浏览器与 iPhone 17e／iOS 26.5 模拟器 Safari 检查新增、换肤、刷新保存和输入光标；测试补给点已清理，未出现控制台错误。`rtk proxy node tools/package-web.mjs /private/tmp/kairos-ui-fixes-20261111-final` 生成 19 个发布文件，逐字节与源码一致，全部发布模块通过 `node --check`，`rtk git diff --check` 通过。实际 iPhone 与独立 PWA 待更新后验证，本轮未提交部署；截图见设计文档。

## 路线库与 iGPSPORT连接（2026-11-16）

本轮按用户确认的路线 UI 实现 #14 的路线部分：通用来源列表、iGPSPORT 中国站密码／扫码两种登录、搜索分页、详情预览、应用路线到当前计划。个人档案五项与 #15 自动生成尚未实现；不将本轮视为整个 #14 完成。原 Issue 的「不新增账号」由本轮决定调整为「无需 Kairos 账号，可选连接自己的路书提供商账号」。

- `route-providers.mjs`：来源目录与客户端工厂；当前仅一个已接入来源。
- `igpsport.mjs`：中国站接口适配；`route-session.mjs`：本地令牌读取、到期检查和断开。密码不持久化、提交后清空，不保存账号或 QR challenge。二维码确认成功后才存令牌，无自动刷新，失效重新连接。
- `route-picker.mjs`：来源、登录、搜索和预览交互。QR 等待与确认每 1.5 秒查询一次、两分钟客户端有效期；切换方式、返回来源、关闭面板会取消请求和定时等待；后台页面暂停发起轮询，回到前台后在未过期时继续。过期或失败移除旧码并允许刷新。
- `qr.mjs` 与 `vendor/qrcodegen.mjs`：本地编码，使用 Nayuki MIT 库；不向外部图片服务发送 QR challenge。
- `routes.mjs`：米制摘要、经纬度和可选海拔，处理官方 `longitute` 拼写；球面距离累计用于轨迹位置，不把轨迹估算长度覆盖路书标称距离。不从海拔缺失的数据假定平路。SVG 轮廓只抽稀显示，保存完整轨迹；不调用导航或地图服务。
- 可选路线保存在对应计划与导出快照中；旧计划库无此字段继续可用。选路不移动已有点；太短则拒绝使用，用户可先调整。移除路线保留全程与点位；复制、历史复用携带原路线。令牌与计划库分开，路线字段中不含连接令牌。浏览器空间不足时仍保留内存计划并显示未能保存，不声称持久化成功。

接口依据：[iGPSPORT 当前官网](https://app.zh.igpsport.com/) 公开前端及[公开参考代码](https://github.com/ID-VerNe/skill-forge/blob/master/igpsport-downloader/scripts/igpsport_download.py)。这里复用官网网页接口，不是已获批准的第三方 OAuth；官方客户端接口可能变化。

验证：66 项 Node 行为测试通过，新增覆盖密码／QR 响应、等待／已扫／确认／过期、令牌到期、取消与超时、网络与格式错误、轨迹坐标和海拔、计划隔离、路线持久化及历史快照。QR 栅格经过 macOS CoreImage 独立解码核对；首次沙箱识别未成功，软件渲染并在批准的沙箱外验证后通过。真实中国站创建、轮询接口返回成功，浏览器下真实二维码生成及等待状态已观察到；首次浏览器请求失败，重试后成功，不把终端成功当作用户登录验收。

402×874 本机浏览器使用明确标注的模拟数据验证扫码确认后进入搜索、密码登录、搜索／详情／应用、刷新恢复、短路线拒绝、过期重连和断开。慢响应下切回密码后没有轮询、不会让迟到二维码重新出现；320×700 下五套皮肤的密码面板均为 570 px，scrollHeight 与 clientHeight 相等。28 个发布文件逐字节匹配源码，模块语法、导入路径、DOM ID 和差异空白检查通过；8 个原有 `.workout` 样本仍通过 Apple WorkoutKit 精确对象比较。

模拟确认不是用户真实 App 授权的结果；真实账号密码、App 扫码确认后的搜索和详情、同机扫码体验仍需用户验收。未读取或要求用户提供密码／令牌，未引入共享服务端账号。本轮未提交、推送或部署。

连接错误修复：真实页面把原生 `fetch` 保存为客户端方法后，调用时的接收对象变成 `IGPSPORT`，浏览器报 `Illegal invocation`；诊断页同一个匿名请求绑定 `window` 后返回 HTTP 200／code 0。之前成功的测试页绑定过 `window.fetch`，模拟请求也未检查接收对象，不能代表原生调用路径已通过。客户端现将 fetch 绑定到 `globalThis`，新增接收对象回归测试，先复现失败再修复；共 67 项 Node 测试通过。与 iGPSPORT 账号、密码错误或 CORS 拒绝分开判断。

修复后直接刷新 `http://127.0.0.1:8787/`，在未包装／模拟 fetch 的真实页面中已能生成登录二维码并显示等待扫码。没有代用户输入密码或确认登录；账号登录后的搜索仍待用户验收。

## 文件与分享

`web/workout.mjs` 使用无依赖 JavaScript 写入 protobuf 二进制，输出真正的 WorkoutPlan `.workout`；仅支持本产品需要的户外骑行、单次 work block、米制距离目标、开放末段和中文分段名称。字段参考 [DotnetWorkoutKit](https://github.com/changeforan/DotnetWorkoutKit/tree/0978caf9deafeafa3d371daab6f216376a0ec31f)，许可说明位于 `web/NOTICE.txt`。

这不是 Apple 公开承诺稳定的跨平台文件规范；必须用实际 Apple 解析器和目标设备验证。当前字段为 WorkoutPlan UUID 9、自定义训练 11、版本 1000=1、格式 1002=5。未用不支持的 JSON 形式替换二进制，也未将文件伪装成其他类型绕过分享限制。

累计里程转换复用原生语义：提醒放在到点后开始的下一段；0 米作为初始段名称，不生成零距离目标；尾段骑到计划全程，之后是开放完成段。精度也一致：公里量级按 100 m，不足一公里按 0.1 m 取整，取整重合要求合并。

页面随输入在内存中准备 File，后缀 `.workout`、MIME `application/octet-stream`。分享按钮点击后直接调用 `navigator.share({files: [file]})`，没有先下载、fetch 或异步生成；不额外分享 URL／文字。`canShare` 仅表示浏览器允许分享，不表示“健身”可用。

分享成功返回只说明交给系统，不表示导入或手表接收。取消保留表单；拒绝和不支持有明确状态。折叠的测试信息记录文件、环境和分享错误类别，不包含补给内容。当前主入口按用户选择使用原备用下载路径；系统分享保留在帮助中。

修改及草稿恢复复用计划 UUID。导入时实际是覆盖还是新增、如何删除旧项，尚待真机记录；稳定 UUID 不等于系统一定覆盖旧导入项。

## 静态托管

当前计算和文件生成都在浏览器，没有 Kairos 账号、D1、配对码或服务端计算。可选 iGPSPORT 路书连接直接调用其中国站接口，用户令牌仅保存在当前浏览器；不需要 Kairos 后端。**优先用 Cloudflare Pages 静态托管**；已有 Worker 不需要为了这个实验被覆盖。

Pages＋D1 并不意味着浏览器直连数据库。未来需要持久化时可用 Pages Functions → D1，或 Pages 静态 → 独立 Worker → D1；绑定与凭据留在服务端。Pages Functions 本身使用 Workers 运行时。域名／线路的可达性应实测，不能从产品名称保证国内访问。

站点已由用户部署到 https://kairos-2rm.pages.dev/ 。本次计划库改动仅本地实现，未创建新 Cloudflare 资源或执行远端部署；线上是否包含本次功能以实际部署提交为准。

## 本机运行与打包

网页无 npm 依赖，Node.js 22 可运行测试与打包；Python 3 可提供本机静态预览：

```sh
rtk proxy python3 -m http.server 8787 --bind 127.0.0.1 --directory web
rtk proxy node --test web/test/*.test.mjs
rtk proxy node tools/package-web.mjs
```

打包工具输出一个新建的 `/private/tmp/kairos-file-share-<时间>/` 目录，当前包含 31 个发布文件，排除测试和工具源码。也可传入新目录，例如 Git 集成使用 `node tools/package-web.mjs dist`。预构建目录上传方式无需另执行构建；Git 集成的构建参数详见 Pages 文档。`_headers` 设置 CSP 和 `web-share=(self)` 等策略；保留该文件及 NOTICE。

`127.0.0.1` 是访问设备自身：Mac 和模拟器可用本机预览，真实 iPhone 不能用这个地址访问 Mac。局域网普通 HTTP 不满足 Web Share 安全环境要求，真机用实际 HTTPS 地址；不要通过忽略证书警告作为验证步骤。

## Apple 独立互操作验证

`tools/generate-workout-fixtures.mjs` 生成八种不同输入及 JavaScript 编码文件，包括计划库的自定义训练名称。开发用 `tools/verify-workout.swift` 使用 Apple WorkoutKit 解码，并和现有 `FuelPlan.workoutPlan` 产生的完整对象比较，包括 UUID、骑行类型、目标、单位和所有中文名称；具名样本只替换预期对象的训练名称，还检查 Apple 重新编码后可再次读入。

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

## 初期真机检查模板（历史）

1. 真实 iPhone Safari 打开待确认的 HTTPS 测试地址，填写实际设备与系统版本。
2. 点“分享训练”，确认不经过手动下载即出现分享面板。
3. 确认“健身”目标出现，系统预览的户外骑行、中文分段名称与页面一致，确认添加到配对 Apple Watch。
4. 在系统“体能训练”找到并启动，分别记录到点文字、声音／触感、0 米、终点之后继续骑行。
5. 修改后重新分享，观察覆盖／新增及旧项删除行为；没有回执的状态不推定成功。

当时以直接分享作为实验目标；后续用户已选择原备用下载为主入口，并确认骑行提醒闭环通过。保留模板用于排查设备差异，不要求为当前 Web 计划库重复验收，也不回到自有原生 App 方案。

## 直接进入健身预览的实验（2026-11-11）

用户要求进一步省掉寻找文件及选择分享目标：点击网页按钮后直接展示**这份计划**的健身预览，用户只作系统添加确认。下载确认、分享菜单及只打开健身首页均不算通过。跟踪 [Issue #8](https://github.com/The-V-Factor/Kairos/issues/8)，使用独立测试分支，不合并生产 main；Pages 预览与真机结果记录在 Issue。

从计划页使用说明的「试试直接打开健身」进入 `/open/`，或直接访问该路径。页面读取同域名已保存草稿；未保存的编辑先在计划页保存。此页不写入或覆盖草稿，不变更二进制编码和主分享按钮。

| 路径 | 具体操作 | iOS 26.5 模拟器 Safari、本地 HTTP 的结果 |
| --- | --- | --- |
| A：当前计划 File URL | 预先生成 File，以 Blob URL 导航；不使用 download 属性或 share() | 弹出下载确认，名称 Unknown；未直达健身 |
| B：当前计划的本机文件地址 | `/open/` 范围的 Service Worker 从 Cache Storage 返回当前计划，提供 `.workout` 路径和 inline 文件名 | 弹出下载确认，正确识别 `.workout` 文件名；未直达健身 |
| C：服务器静态文件直链 | 打开 `assets/direct-open.workout`，响应含 octet-stream 类型、inline 文件名、no-store | 弹出下载确认；未直达健身 |

固定控制文件为 1 km 户外骑行，200 m「直达测试·喝水」、600 m「直达测试·吃胶」；只用于文件打开对照，不限制用户计划。源码输入保存在 `web/test/direct-open-plan.json`，修改时使用现有 encodeWorkout 重新生成对应二进制，测试会检查二者一致。Apple WorkoutKit 已解析该文件并与原生 WorkoutPlan 完整比对，257 字节，合计 10 个互操作案例通过。

读取测试模拟器的系统 Fitness.app 应用包元数据，确认其声明文件类型 `com.apple.workout`、扩展名 `workout`，且 document handler 为 Owner；没有注册专用 MIME 字符串，因此没有编造 MIME 类型绕过系统。URL scheme 声明包含 fitnessapp，但未查到可接受我们计划数据的可靠入口，实验没有用仅打开训练首页代替导入。

浏览器 Service Worker 仅注册于 `/open/`，只拦截同源 GET 的测试 `.workout` 文件；缓存缺项返回明确 404，不向服务器回退取计划。只保留一份最新测试文件在浏览器，不读健康数据、不上传内容、不接管其他页面、第三方网址或写入请求。若健身自身随后联网取这个本机文件地址，它无法读取浏览器缓存，所以保留 C 的真实服务器文件作独立对照。

`node --test web/test/*.test.mjs` 21 项通过；新增测试覆盖静态文件一致性、本地响应字节及 inline 头、过期缓存 404 与范围隔离。Pages 本地模拟器已解析两条 header 规则，固定文件返回 200，Content-Disposition 为 inline。

![本地 iOS Safari 对静态训练直链仍弹出下载确认](assets/screenshots/direct-open-ios.jpg)

**当前结论：此环境下三条路径均未实现直达，未达到交互验收标准。** 已保留实验入口供真实 HTTPS／iPhone、Safari／主屏幕模式分别复测；未把本地 HTTP 结果说成所有 iPhone 均不支持。真机复测使用 Issue #8 对应测试分支的 Pages 预览，不自动替换生产主流程。


## B 作为主入口（2026-11-11，Issue #8）

用户在真实 HTTPS 页面反馈 A 失败；B/C 仍有下载确认，但可以从 Safari 下载列表直接打开，不需要再寻找文件夹。未提供设备型号／系统版本，也未确认主屏幕模式。原始「网页一点直达健身预览」目标仍未达到；用户明确接受上述较短流程并选择 B。

首页「下载训练」提前把当前计划准备为同源 `/open/Kairos-<id>.workout` 地址，不在点击中等待异步生成。修改计划立即移除旧链接；串行替换缓存，只允许最新准备结果启用主操作。无效计划、删除动画、分享期间禁用。系统分享能力不影响文件地址；准备失败可在说明中分享或备用下载。

共享的 `file-address.mjs` 用于首页与实验页，浏览器 Worker 仍只控制 `/open/`、只返回本机缓存，不控制主页、不上传计划、不代表完整离线 PWA。缓存缺项提示回计划页刷新，设备导入与手表接收仍需用户确认。服务器不持有这些文件，复制文件网址到另一设备不支持获取计划。


本轮验证：26 项 Node 测试通过（含 Worker 激活等待、慢旧写入不会覆盖新计划、失败后恢复、不依赖 Web Share）。本地 Pages 发布包解析两条响应头规则。iPhone 17e / iOS 26.5 模拟器 Safari：首页主操作弹出正确 `Kairos-<id>.workout` 下载确认，已取消下载；不将此当作真实手表导入验证。内置浏览器能确认编辑后链接重新启用，但下载自动化两次超时，未拿到下载产物；以 Safari 下载确认和缓存字节测试作为本轮对应证据。

![首页 B 主入口在 iOS Safari 弹出正确文件名的下载确认](assets/screenshots/web-download-ios.jpg)


## 主屏幕模式改用系统分享（本地试验，2026-11-11）

用户报告：添加到主屏幕后，B 文件网址可以直接进入健身，但回来停在文件界面，没有返回计划页的方法。当前本地改动以 `navigator.standalone` 或 `display-mode: standalone` 识别主屏幕模式：主操作改用已准备 File 的系统分享，不导航文件地址、不准备 B 缓存。Safari 保持 B 下载入口。PWA 不支持文件分享时明确禁用并给说明，不自动退回会卡住的文件导航。

验证：26 项 Node 回归通过，涵盖同步分享、取消、失败和不支持。iPhone 17e / iOS 26.5 模拟器，实际通过 Safari 添加 localhost:8792 到主屏幕并启动：PWA 显示「分享训练到健身」，点击弹出系统文件分享面板，识别为 Apple Watch 训练文件；取消后保留原 75 km 和三个补给点，仍可打开并取消编辑。Safari 显示原「下载训练」入口。模拟器分享目标列表没有健身，因此没有验证真实健身导入后返回，也没有真实触感设备证据。本轮未提交、推送或部署。

| PWA 文件分享 | 取消后计划仍可继续编辑 |
| --- | --- |
| ![PWA 的系统文件分享](assets/screenshots/web-pwa-share-ios.jpg) | ![取消分享后返回原计划](assets/screenshots/web-pwa-return-ios.jpg) |

### 触感演示源码调查（未接入）

调查版本：`samdenty/ios-vibrator-pro-max` 提交 `032cc0aed2b8097d7d5cd8e286fedd63d5e85d11`。以下为源码事实与解释，不能替代真实 iPhone 触感测试：

- [time-picker.tsx](https://github.com/samdenty/ios-vibrator-pro-max/blob/032cc0aed2b8097d7d5cd8e286fedd63d5e85d11/demo/src/components/time-picker.tsx)：以 `Math.round(-y / 52)` 决定索引，索引变化请求 40 ms 震动。因此移动半格便改变索引，无需下个数字到达中心；松手后的 spring 动画也继续请求触感，没有按拖动状态过滤。快速漏震的具体原因没有真机追踪，不能说仅由该公式造成。
- [slide-to-unlock.tsx](https://github.com/samdenty/ios-vibrator-pro-max/blob/032cc0aed2b8097d7d5cd8e286fedd63d5e85d11/demo/src/components/slide-to-unlock.tsx)：按进度多次请求震动，间隔从约 20% 缩小至终点附近约 1%，每次 10–20 ms。不是解锁完成时单次反馈；慢拖有多次触感符合此设计。代码注释写开始约 5%，与公式不同，以公式为准。
- [elastic-slider.tsx](https://github.com/samdenty/ios-vibrator-pro-max/blob/032cc0aed2b8097d7d5cd8e286fedd63d5e85d11/demo/src/components/elastic-slider.tsx)：页面称 Haptic slider；按原始手指位置跨过画出的刻度边界触发 20 ms，与数值四舍五入分离；按下也请求 20 ms。这更符合尺上实际刻度和触感同步的目标。
- [movable.ts](https://github.com/samdenty/ios-vibrator-pro-max/blob/032cc0aed2b8097d7d5cd8e286fedd63d5e85d11/src/methods/click-passthrough/movable.ts)：触感窗口内不断随 pointermove 翻转隐藏开关方向，并覆盖 pointer capture。每次 vibrate 请求不等于系统承诺的一次物理触感。由此推断，慢拖的窗口内多个原生变化可能出现多次触感，快拖或松手后可能漏触感。

结论：不把整库接入当前原生惯性滚动距离尺。若后续实验，应按实际跨刻度触发、静止不重复、快速滑动不排队补震，并分别验证拖动、惯性与双指缩放。系统触感送达仍需真机判断。


## Issue #10：距离尺触感试验实现（2026-11-11）

触感入口位于「使用说明 → 距离尺触感试验」，默认关闭，仅本次页面打开有效。使用 Haptic slider 的实际跨刻度语义，与显示数值四舍五入分开；慢拖到刻度才请求、静止不重复、40 ms 内快速跨格丢弃额外请求，不排队补震。

`haptics.mjs` 局部实现：支持标准振动 API 的浏览器在原生拖动中请求反馈；iOS 原生 switch 路径只在距离尺的刻度轨道覆盖真实手势，使用一次方向切换请求一次跨格反馈，不创建持续脉冲窗口，不引入整页 polyfill。没有重写 document.body、navigator、其他控件事件或 pointer capture，没有后台弹窗或主线程阻塞。仅在该试验路径内驱动横向拖动与衰减惯性，纵向手势转为页面滚动，双指触控停止当前触感并交给原有缩放处理。关闭时移除覆盖、停止惯性并恢复原生滚动；移动标记、改总距、缩放、开面板与隐藏页面也取消触感状态。没有复制第三方库；机制参考前述固定版本源码。

验证：32 项 Node 测试通过，新增 6 项覆盖实际边界、快速不补发、正反向与非整数终点、缩放／范围变化、局部原生拖动／关闭清理及双指／取消清理。iOS 26.5 / iPhone 17e 模拟器检查了开关可启用、缩放、取消补给编辑、关闭试验后全览；浏览器检查了普通下载入口、开关、键盘浏览及缩放，无 console error。原生模拟器自动拖动没有稳定改变读数，不作为手势或触感通过证据。多指真实手势、震动节奏及健身导入后返回仍待真实 iPhone 验证。

![iOS 模拟器的触感试验开关](assets/screenshots/web-haptics-ios.jpg)

PWA 分享代码与前述取消返回证据一同纳入 #10；编码协议与草稿数据格式不变。用户已授权本次提交、合并与部署，真实触感和完整健身往返结果继续在 #10 跟踪，不宣称已通过。


## 真机反馈后的主入口调整（2026-11-11）

用户确认原「备用下载」体验最好。将这条已验证路径提升为首页「下载训练」：继续使用准备好的 File、Blob URL 和带 download 属性的链接，不改变文件字节、文件名及 URL 回收时机。Safari 与主屏幕模式统一此入口，系统分享留在说明中，B 文件网址保留在打开方式对照实验页；主页不再等待 Service Worker 地址准备。下载前停止局部触感手势。

用户另确认「快速移动不震动」发生在松手后的惯性滑动，并非手指按着快拖。当前明确在 pointerup 后结束 TickFeedback，惯性帧只移动刻度。iPhone 的局部 switch 路径依赖真实触摸，不能简单地在惯性动画内重复调用标准 vibration API 或模拟 click 来可靠获得反馈；本轮不修改该机制，不宣称已修复惯性震动。

WebKit 当前 [CheckboxInputType.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/CheckboxInputType.cpp) 的 handleTouchEvent 在 touchend 停止触控计时，触控跟踪依赖 trusted event；[相关修复 PR #65327](https://github.com/WebKit/WebKit/pull/65327) 明确限制脚本点击 label 触发触感。公开开源 polyfill 的拖动样例仍依赖真实手势，不是惯性触感的可靠方案。

本地 32 项 Node 回归通过；17 文件发布包与源码一致、语法与 diff 检查通过。浏览器检查了主按钮可用、说明与入口一致，无 console error；本轮未重复导入真实手表。提交及部署状态见 Issue #10。

![原备用下载成为主操作](assets/screenshots/web-download-primary.jpg)

## Issue #13：Web 本机计划库（2026-11-13）

- `rtk proxy node --test --test-reporter=dot web/test/*.test.mjs`：47 项通过。新增覆盖旧草稿迁移一次、ID／精确距离／自定义补给保留、多计划隔离、日期与命名、复制新身份、导出快照不可变、相同版本去重、历史复用、删除最后一份／撤销，以及存储拒绝、损坏和未来版本不覆盖。
- 浏览器 402×874 与 320×740 实际操作：创建不同日期计划、复制历史、重命名、修改副本点位为 0 公里后原计划不变、切换与刷新恢复；删除全部显示空态，撤销恢复最后一份，历史仍保留。新建／复制后回到计划页签显示新条目。空名称显示校验且禁止创建。深色 B 与浅色 A 的面板和文本可读，控制台没有警告或错误。
- iPhone 17 / iOS 26.5 模拟器 Safari：输入名称 River、原生日期选择 11 月 15 日并创建，与原 75 km 示例按日期分组；软键盘可收起，表单可滚动，保存可用。在新计划添加 37.5 km 默认喝水，下载弹出正确文件名确认；取消下载后历史仍只写“请求下载”。刷新恢复当前计划和点位。此轮没有重做真实 Watch 骑行验收。
- 八份 JS 生成文件均通过实际 Apple WorkoutKit 解码、完整对象相等与重编码往返；具名样本为 `Kairos · 周末河堤 🚲`。命令沿用上方互操作步骤，输入目录为 `/private/tmp/kairos-issue13-interop`，检查程序为 `/private/tmp/kairos-verify-workout-issue13`；Swift 工具严格格式检查通过。
- `rtk proxy node tools/package-web.mjs /private/tmp/kairos-issue13-pages-final` 生成 20 个发布文件，逐字节与源码一致，所有发布模块通过 `node --check` 且相对导入均可解析；`rtk git diff --check` 通过。差异自查未发现阻塞问题。本轮代码、截图与文档仍在本地分支 `codex/issue-13-web-plan-library`，尚未提交、推送或部署。

| iOS 新建后分组 | 下载请求历史 | 软键盘 |
| --- | --- | --- |
| ![iOS 本机计划库](assets/screenshots/web-library-ios.jpg) | ![iOS 下载请求历史](assets/screenshots/web-library-history-ios.jpg) | ![iOS 新建计划软键盘](assets/screenshots/web-library-keyboard-ios.jpg) |

计划只在当前浏览器保存；回滚旧页面可读取遗留单草稿，但不认识新计划库，后续编辑不会反向同步。保留旧键用于安全迁移，不应将旧草稿误认为最新计划。线上更新后的真实 iPhone／主屏幕模式验收留待发布，本轮不改变用户已选择的下载路径或触感策略。

## 标题合一与紧凑编辑验收（2026-11-16）

用户选定 01「标题合一」，要求公里滚轮步长 1 km，并要求计划编辑在 iPhone 17 Pro 高度内完整显示。本轮继续在 Issue #13 原分支实现，没有创建其他分支或开始后续 Issue。

- `rtk proxy node --test web/test/*.test.mjs`：52 项通过。新增 5 项覆盖周一开头月历、闰年／跨月／年月边界、整公里窗口与大距离、旧小数／不足一公里保留、名称／日期／全程原子保存及历史不变。
- 编辑计划日期、全程只改变表单草稿；取消不写库，保存一次更新名称、日期和全程。复制和历史复用也使用同一表单，可修改全程，原点位保留。缩短到补给点之前时按钮禁用并说明原因。
- 浏览器实际验证新建 30 km、添加默认喝水、下载后查看历史、从历史复用 30 km、切回 75 km 原计划。此前副本检查 75→78 km、三个固定点不移动；20 km 被拒绝；直接输入 12,500 km 可返回滚轮，取消仍保留原计划。
- 402×700：月历高 518 px，公里滚轮高 537 px；外层面板 scrollHeight 与 clientHeight 相等，保存按钮在面板内。五套皮肤的该尺寸月历均 518 px，无外层溢出；320×700 月历高 578 px，保存可见。这里验证的是浏览器视口，不冒充实际 iPhone 17 Pro 设备结果。
- iPhone 17 / iOS 26.5 模拟器 Safari：月历六行、滚轮与保存均同屏；点相邻行可从 75→76 km，取消恢复 75 km。修复聚焦名称导致面板缩小后误关的问题；软键盘展开时收起选择器，保存按钮可直接点击并成功返回首页。自动化拖动／滚动没有稳定改变数值，不记作真实手指惯性或手感通过。
- 打开表单本身不主动全选。没有重做真实 Watch 导入或骑行验证，也没有调整既有触感和下载方案。
- 本机浏览器曾缓存旧模块；用独立 `localhost:8813` 地址确认最终名称辅助标签和最新模块。原 `127.0.0.1:8803` 预览保留，查看时如仍是旧界面可强制刷新。独立验收地址的数据与旧预览不同，示例截图不读取真实设备数据。
- 发布目录：`rtk proxy node tools/package-web.mjs /private/tmp/kairos-unified-plan-20261116`，共 21 个文件，加入 `plan-controls.mjs`。本轮没有提交、推送、合并或部署。
- 发布包逐字节与源码一致，所有模块 `node --check` 通过，相对导入可解析；HTML ID 无重复，README 图片路径存在，`rtk git diff --check` 通过。最终名称辅助标签包含可见计划名，独立预览未见 console 警告或错误。自查未发现阻塞问题；真实手指滚动手感留待用户试用。

| Safari 六行月历 | 紧凑滚轮 | 键盘展开 |
| --- | --- | --- |
| ![Safari 月历](assets/screenshots/web-unified-calendar-ios.jpg) | ![Safari 滚轮](assets/screenshots/web-unified-wheel-ios.jpg) | ![键盘展开仍能保存](assets/screenshots/web-unified-keyboard-ios.jpg) |

### 最终入口与合并前验证（2026-11-16）

- 标题旁铅笔打开当前计划编辑；右上角按皮肤、历史、帮助排列，历史直达导出历史。402×874 和 320 px 窄屏验收通过，后者换肤按钮只显示图标，避免长皮肤名换行；辅助标签保留全名。控制台无警告或错误，原计划和 B 皮肤已恢复。
- 合并前重新运行 52 项 Node 测试、21 文件发布包逐字节／语法／依赖／HTML ID／README 图片检查，以及 8 份文件的实际 Apple WorkoutKit 解码与往返比较，全部通过；Swift 工具严格格式检查和 `rtk git diff --check` 通过。
- 最终发布包校验目录为 `/private/tmp/kairos-issue13-merge-20261116`，互操作输入目录为 `/private/tmp/kairos-issue13-merge-interop-20261116`。本节记录本地验证；合并及远端检查结果见 Issue #13 对应 PR，不将合并视为真实手机发布验收。


## 路线详情坐标尺（2026-11-16）

当前计划的路线入口文案改为「查看详情」，避免与历史路线库混淆。海拔 SVG 增加米制海拔纵轴、距离横轴与浅网格；范围由完整轨迹海拔决定，横向位置将轨迹累计距离等比映射到路书标称距离，保留真实终点标签。刻度按整 1／2／5 倍数安排，支持零海拔、负海拔、平路与海拔缺失；累计爬升单独显示，不作为海拔坐标。新增 3 项测试，合计 70 项 Node 测试通过。路线库与搜索空状态的风格提案及地图评估见 [设计参考](design-references.md#路线库搜索状态与剖面2026-11-16)，未提前实现待评审样式或地图底图。


## 海拔图缩放与拖动（2026-11-16）

使用本地 `vendor/d3-zoom.mjs`（D3 zoom 3.0.1＋selection 3.0.0，含 9 个 ISC 依赖）和 `elevation-chart.mjs`。`routes.mjs` 的 `elevationProfile` 使用原始轨迹构造当前窗口：边界插值、可见海拔范围、保留峰谷的绘制抽样和自适应距离刻度。没有触碰计划、令牌、导出或路线 API。

验证：74 项 Node 测试通过；新增窗口边界、平移限位、可见区间海拔、原始尖峰保留及重置检查。`/test/elevation-browser.html` 为仅开发预览的合成轨迹页面，11 项浏览器集成检查通过，覆盖鼠标拖动、双指连续 TouchEvent 缩放、单指 TouchEvent 平移、触摸目标重绘后仍挂载、键盘和换路线重置。测试页不读取账号或当前计划，不进入发布包。

真实「东涌黄阁南沙」路线上，按钮放大使窗口由 0–80 km 变为 22.2–57.8 km，实际鼠标拖动移至 33.1–68.7 km，全览恢复 0–80 km；402×874 下检查图表和控件，原计划未改动。TouchEvent 集成测试不是物理手机多指手感验收；iPhone Safari／PWA 的实际触摸体验仍需真机确认。

### 依赖构建与许可

`tools/d3-zoom-entry.mjs` 是构建入口，`tools/d3-zoom-package-lock.json` 固定每个依赖的版本及 npm integrity。生产直接托管已构建的 ESM，不要求用户安装 npm。当前包由 esbuild 0.28.2 以 `--bundle --minify --format=esm --target=es2020 --legal-comments=none` 生成；全部原始许可另保存在 `web/vendor/d3-zoom.LICENSE.txt` 并随发布包交付。

重新构建时，在独立临时目录复制入口和 lock 为 `entry.mjs`／`package-lock.json`，从 lock 的 `packages[""].dependencies` 创建临时 package.json，使用 `npm ci --ignore-scripts` 安装精确依赖，再用上述固定版本 esbuild 输出 `web/vendor/d3-zoom.mjs`。更换依赖时同步更新 lock、许可和体积记录。比较与取舍见 [设计参考](design-references.md#交互海拔图组件选择2026-11-16)。本轮仅本地修改，未提交或部署。

## 本次发布验收范围（2026-11-16）

用户自行登录后，真实 iGPSPORT 会话搜索「南昆山」返回 20 条路书，详情「白水寨南昆山正果5689581.gpx」成功显示 136.8 km、累计爬升 741 m、轨迹轮廓与海拔曲线。上述真实链路已验证，不再沿用早期模拟验证阶段的待登录结论。未代用户输入密码、未读取令牌，预览未改动其计划。

本次提交发布范围为路线库入口、密码／扫码连接、搜索与详情、可选路线本地保存、海拔坐标尺及 D3 缩放平移。74 项 Node 测试、11 项浏览器事件集成检查和 31 文件发布包校验通过。个人档案和自动补给模型仍未实现，#14 不关闭；路线库／搜索页的后续风格稿和地图底图仍只作设计参考。真实手机多指手感继续由用户确认。
