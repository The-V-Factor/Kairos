# Kairos 开发说明

纯网页 `.workout` 文件与系统分享见 [网页实现及验证](web-file-sharing.md)，已完成 B「节奏」界面与本地草稿；真实设备导入仍待验证。发布步骤见 [Cloudflare Pages](cloudflare-pages.md)。下文仍描述已合并的 iPhone 版本。

原生 iPhone 骑行补给实验：手动填写骑行日期、计划总距离、各补给点的距出发里程和提示，通过 WorkoutKit 提交所选日期的训练，由 Apple Watch 系统“体能训练”记录骑行、呈现分段提示。没有独立手表 App、账号、网络服务或补给算法。

## 在 iPhone 上运行

1. 用 Xcode 16 或更新版本打开 `Kairos.xcodeproj`，选择 `Kairos` scheme。
2. 在 Signing & Capabilities 中自行选择开发团队，必要时改为自己的唯一 Bundle Identifier。仓库不保存团队、证书或账号配置。
3. 选择已配对 Apple Watch 的真实 iPhone，运行。最低 iOS 18；分段名称需要 watchOS 11 或更新版本。
4. 先设置计划距离，拨动距离尺选择位置，点尺右上角“＋补给”。底部轻面板固定带入打开时的位置，大物件与提醒并排，小图标条切换水／胶／自定义；水默认“喝水”，胶默认“吃胶”，自定义另填名称。尚未手改时默认提醒随类型切换，手改后保留输入。点“添加”保存，取消或下滑关闭不保存。左滑条目露出红色删除按钮，点按删除后可撤销；点击条目仍进入编辑面板，支持精确米/公里输入和删除。保存的距离统一使用米。旧“其他”归入自定义，空名称使用“补给”，保留 ID、距离与提醒。
5. 首页核对累计提醒里程，全程数值融入标题行，点数字旁的铅笔修改。距离尺可左右浏览、双指缩放，也提供放大/缩小/全览；点击节点联动点位列表。首页浏览不修改已有点；已有点的距离仍在编辑面板修改。右上角可选择沿途、节奏、路书、口袋补给或精密刻度皮肤，并开关交互触感；计划和外观分别在本机保存。点底部“发送到 Apple Watch”，按系统提示授权训练排程。问号可以查看完整使用条件。
6. 等待系统同步，在 Apple Watch 的“体能训练”里找到 Kairos 对应日期的“骑行补给”计划，检查分段后手动启动。
7. 右上角历史入口按骑行日期分组，自动保存发送时的计划。同一计划同日重发更新当天记录，其他日期保留；同日已完成的计划再次发送会使用新的计划 ID，保留先前完成记录。历史详情可对照补给累计里程与系统分段，也可撤回指定计划和日期的系统排程，保留本地历史与运动记录。

本机签名团队也可写入被 Git 忽略的 `Config/Signing.local.xcconfig`，内容为 `DEVELOPMENT_TEAM = 你的团队ID`；Debug／Release 通过 `Config/Signing.xcconfig` 可选读取。未创建本地文件时，仍可无签名构建或在 Xcode 选择自己的团队。证书与 Apple 账号继续由 Xcode 管理。

本机提交完成不等于手表已经收到。没有远端同步回执；需在手表核对。修改后需要重新发送，已开始的训练不保证随修改更新，先停止测试再重发。

只请求 WorkoutKit 的训练排程授权，不申请 HealthKit 数据读写、定位、通知或后台运动权限。`HealthKit` 的导入仅用于构造训练类型，没有访问健康数据存储。无需开启 HealthKit capability。

## 分段与提示

先输入计划总距离，再输入各点的**距出发累计里程**。例如计划 100 公里，点位为 `25 公里 → 吃胶`、`45 公里 → 喝水`、`70 公里 → 吃胶`。点位按里程排序；删除或移动一个点、修改计划总距离都不改变其他点的位置。只有生成 WorkoutKit 计划时，才将固定位置转换成相邻分段的距离差。

| 系统分段 | 距离目标 | 分段名称 |
| --- | --- | --- |
| 第一段 | 25 公里 | 骑行 |
| 第二段 | 20 公里 | 25.0km 吃胶 |
| 第三段 | 25 公里 | 45.0km 喝水 |
| 尾段 | 30 公里 | 70.0km 吃胶 |
| 完成段 | 开放目标 | 100.0km 计划完成，继续骑行 |

这是将到点提示放在**下一段开始时**呈现的设计。提示也可能提前出现在系统的下一段预览里，并持续作为当前分段名称；实际是否容易察觉必须真机验证。最后补给后先骑完尾段，到计划总距离才进入开放的完成段，继续骑行后由用户手动结束。补给点恰好在终点时，在同一个开放段合并补给与完成文案，不创建零距离段。

总距离必须大于零、有限；不接受千位分隔符、单位后缀或科学计数法，小数分隔符随系统区域。点位可以位于 [0, 总距离] 内，不能重复里程；同处补给合并在一条提醒中。空计划、空白文案不能发送。未完成的计划重复发送复用 UUID，仅替换这个 UUID 在所选日期的排程，不删除其他日期或其他计划。系统没有原子替换接口，若新排程未确认，保留之前的历史版本并将状态改为待刷新，不能继续声称旧计划在系统里。

距离以首页显示的一位小数为准：公里量级按 0.1 km（100 m）取整，不足一公里按 0.1 m 取整。新增和编辑保存规范值；旧草稿读取不覆盖原存档，显示和导出使用规范值，下次成功发送后保存统一精度。取整导致两点重合时要求用户明确合并，不静默删点。单位输入仍可切换米／公里，最终以首页展示精度保存。

0 公里补给合法。发送时将它作为系统训练初始段的名称，不创建 0 米距离目标；仅有出发补给时先骑到计划总距离，再进入完成开放段。开始时文字、声音及触感的实际表现仍需 Watch 真机验证，不承诺独立通知。

## 历史与系统排程状态

历史使用独立存储键 `kairos.planHistory.v1`，当前草稿继续使用 `kairos.fuelPlan.v1`，所选日期按年月日保存于 `kairos.rideDate.v1`。历史主键为计划 UUID＋骑行年月日，保存 `FuelPlan` 快照和实际导出的 `WorkoutPlan.dataRepresentation`；日期不以发送时间或 UTC 零点代替。同一天允许多个计划 UUID。当前草稿编辑不改历史，撤回排程不删历史。

`scheduledWorkouts` 只列出本 App 排入系统的计划。可读回计划内容、日期和 `complete`；不包含手表在线状态、实时收到回执或运动统计。刷新时将系统中的旧计划补入历史；缺少本地补给元数据时显示原始系统分段，不推断补给类型或总距离。API 没有报告的计划显示“当前排程未找到”，不等同于已撤回。未授权、设备不支持或查询失败时状态待刷新，保留过去完成／撤回的历史事实。

详情的系统分段距离以实际目标的米数呈现，便于与手表核对；旧排程不会被显示成已按新精度导出的版本。需要重发才会替换旧排程。上述定义依据 Apple 的 [scheduledWorkouts](https://developer.apple.com/documentation/workoutkit/workoutscheduler/scheduledworkouts)、[ScheduledWorkoutPlan](https://developer.apple.com/documentation/workoutkit/scheduledworkoutplan) 与 [WWDC23 排程介绍](https://developer.apple.com/videos/play/wwdc2023/10016/)。

撤回操作先读当前排程，仅移除匹配 UUID＋日期的项，再读回确认本机排程已无此项。同步到真实手表仍需确认；权限丢失或读回仍存在时不标记成功。该操作不访问或删除 HealthKit 运动记录。历史存档损坏时保留原始数据并阻止覆盖，显示错误。

Apple WWDC23 说明手表可查看前后各七天的排程，这是展示窗口，不视为自动删除规则。历史长期保存在本机，与此窗口分开。重装 App 会丢失本机历史和草稿；重新授权后可尝试从当前系统排程找回仍由本 App 管理的计划，不能保证恢复系统已不再返回的旧历史。

## 本机旧计划迁移

同一个存储键 `kairos.fuelPlan.v1` 保留不变。旧 JSON 的 `segments` 是分段长度；读取时累加为新的 `stops` 固定里程，保留计划/点位 UUID、类型、名称和提醒。新格式包含 `totalDistance` 与 `stops`，重新读取不会再次累加。总距离留空，请用户确认，不把最后补给点推定为终点。

旧草稿若有无法解析的分段，则从该点起不猜累计位置，保留原输入在 `legacyDistance` 并引导用户重新确认；有效前缀正常迁移。读取本身不覆盖存档，编辑后才保存新格式。删除一个点只删除其对象，撤销恢复原 UUID 和绝对位置。

距离尺由计划总距离定义范围，主刻度按可见距离选择 1/2/5 及其十进制倍数，缩放时重新选择，保留整里程标签，并额外标出不落在主刻度上的实际终点。只绘制一套刻度，直接高亮实际刻度线，读数跟随显示一位小数；保存和发送与显示精度统一。高亮使用各主题鲜明配色，B 为荧光黄绿。已有点用水瓶、胶包或标签标识，过近的点聚合显示数量。拖动时邻近刻度局部起伏，松手/惯性结束后回落，开启减弱动态效果时抑制波动。

## 验证

无需第三方依赖。核心代码同时编入 iPhone App 和 Swift Package；Swift Package 在 macOS 15+ 运行测试，使用实际 WorkoutKit 对象及可控排程替身，不访问真实训练排程。

```sh
rtk proxy swift test
rtk proxy xcodebuild -project Kairos.xcodeproj -target Kairos -configuration Debug -sdk iphoneos SYMROOT=/private/tmp/kairos-device-products OBJROOT=/private/tmp/kairos-device-objects CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= build
rtk proxy xcodebuild -project Kairos.xcodeproj -target Kairos -configuration Debug -sdk iphonesimulator SYMROOT=/private/tmp/kairos-simulator-products OBJROOT=/private/tmp/kairos-simulator-objects CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= build
rtk proxy swift format lint --strict --recursive Kairos KairosCore Tests Package.swift
```

App 的 Xcode scheme 用于构建/运行；自动测试使用 `swift test`，不是 Xcode 的空 Test Action。上面的 SDK 构建不需要签名或启动模拟器。模拟器可验证编辑页面，无法证明真实手表同步、声音、震动或续航。真机执行步骤与本地验证记录见 [真机测试](device-test.md)。

实现文件：`Kairos/` 为界面，`KairosCore/` 为输入校验、训练转换、本机保存与排程提交，`Tests/` 为行为测试。

界面参考、10 个 App 的公开设计依据及配色/布局规则见 [界面设计](design.md)。

## 官方依据

- [WorkoutKit：创建与同步训练](https://developer.apple.com/documentation/workoutkit)
- [Apple 演示：自定义分段名称及分段切换提示](https://developer.apple.com/videos/play/wwdc2024/10084/?time=193)

当前是实验程序，不声称提醒体验已通过真机验收。系统使用实际骑行累计距离，不是路线上的位置；绕路、定位误差可能改变提醒地点。手动跳段尊重用户选择。
