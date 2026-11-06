# Kairos

原生 iPhone 骑行补给实验：手动填写每段距离和到段尾的提示，通过 WorkoutKit 提交当日训练，由 Apple Watch 系统“体能训练”记录骑行、呈现分段提示。没有独立手表 App、账号、网络服务或补给算法。

## 在 iPhone 上运行

1. 用 Xcode 16 或更新版本打开 `Kairos.xcodeproj`，选择 `Kairos` scheme。
2. 在 Signing & Capabilities 中自行选择开发团队，必要时改为自己的唯一 Bundle Identifier。仓库不保存团队、证书或账号配置。
3. 选择已配对 Apple Watch 的真实 iPhone，运行。最低 iOS 18；分段名称需要 watchOS 11 或更新版本。
4. 在“编辑计划”中填写每段距离（单位米，可用小数）和到段尾的提示。初始没有预设距离。“添加补给点”增加分段，每个补给点右上角的减号删除；编辑自动保存到本机。
5. 切换“里程预览”核对累计提醒里程，点底部“发送到 Apple Watch”，按系统提示授权训练排程。按钮上方会显示未完成原因；右上角问号可以查看完整使用条件。
6. 等待系统同步，在 Apple Watch 的“体能训练”里找到 Kairos 当日的“骑行补给”计划，检查分段后手动启动。

本机提交完成不等于手表已经收到。没有远端同步回执；需在手表核对。修改后需要重新发送，已开始的训练不保证随修改更新，先停止测试再重发。

只请求 WorkoutKit 的训练排程授权，不申请 HealthKit 数据读写、定位、通知或后台运动权限。`HealthKit` 的导入仅用于构造训练类型，没有访问健康数据存储。无需开启 HealthKit capability。

## 分段与提示

输入的是**每一段的长度**，不是累计里程。例如自行输入 `125.5 米 → 吃胶`、`300 米 → 喝水`，预览会显示累计 `125.5 米` 和 `425.5 米`。

| 系统分段 | 距离目标 | 分段名称 |
| --- | --- | --- |
| 第一段 | 125.5 米 | 开始骑行 |
| 第二段 | 300 米 | 吃胶 |
| 最后一段 | 开放目标 | 喝水 |

这是将到点提示放在**下一段开始时**呈现的设计。提示也可能提前出现在系统的下一段预览里，并持续作为当前分段名称；实际是否容易察觉必须真机验证。最后一条提示使用开放目标，继续骑行后由用户手动结束。

距离必须大于零、有限；不接受千位分隔符、单位后缀或科学计数法，小数分隔符随系统区域。空计划、空白文案不能发送。重复发送复用本机保存的计划 UUID；编辑后先移除这个 UUID 对应的旧排程，再添加新版，不删除其他计划。系统没有原子替换接口，若新排程未确认，页面提示重试。重装 App 后本地数据和标识会丢失，旧计划可能需要用户从系统中自行移除。

## 验证

无需第三方依赖。核心代码同时编入 iPhone App 和 Swift Package；Swift Package 在 macOS 15+ 运行测试，使用实际 WorkoutKit 对象及可控排程替身，不访问真实训练排程。

```sh
rtk proxy swift test
rtk proxy xcodebuild -project Kairos.xcodeproj -target Kairos -configuration Debug -sdk iphoneos SYMROOT=/private/tmp/kairos-device-products OBJROOT=/private/tmp/kairos-device-objects CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= build
rtk proxy xcodebuild -project Kairos.xcodeproj -target Kairos -configuration Debug -sdk iphonesimulator SYMROOT=/private/tmp/kairos-simulator-products OBJROOT=/private/tmp/kairos-simulator-objects CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= build
rtk proxy swift format lint --strict --recursive Kairos KairosCore Tests Package.swift
```

App 的 Xcode scheme 用于构建/运行；自动测试使用 `swift test`，不是 Xcode 的空 Test Action。上面的 SDK 构建不需要签名或启动模拟器。模拟器可验证编辑页面，无法证明真实手表同步、声音、震动或续航。真机执行步骤与本地验证记录见 [真机测试](docs/device-test.md)。

实现文件：`Kairos/` 为界面，`KairosCore/` 为输入校验、训练转换、本机保存与排程提交，`Tests/` 为行为测试。

界面参考、10 个 App 的公开设计依据及配色/布局规则见 [界面设计](docs/design.md)。

## 官方依据

- [WorkoutKit：创建与同步训练](https://developer.apple.com/documentation/workoutkit)
- [Apple 演示：自定义分段名称及分段切换提示](https://developer.apple.com/videos/play/wwdc2024/10084/?time=193)

当前是实验程序，不声称提醒体验已通过真机验收。系统使用实际骑行累计距离，不是路线上的位置；绕路、定位误差可能改变提醒地点。手动跳段尊重用户选择。
