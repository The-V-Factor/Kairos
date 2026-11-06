# Kairos 界面设计

## 参考选择

以下按 Kairos 相关性选择 10 个设计参考，不是客观的全球前十排名。设计奖、入围和编辑推荐是可核查事实；“借鉴模块”是对公开界面和设计介绍的分析，不代表原产品支持骑行补给。

| 参考 App | 公开评价依据 | 与 Kairos 相近的模块 / 可借鉴点 |
| --- | --- | --- |
| Gentler Streak | [2024 Apple Design Award，Social Impact](https://developer.apple.com/design/awards/2024/)；[设计访谈](https://developer.apple.com/news/?id=3m0ht22s) | 运动健康；柔和视觉、数据层级、友好的指引。主要参考。 |
| Slopes | [2022 Apple Design Award，Interaction](https://developer.apple.com/design/awards/2022/) | 户外运动与手表；关键数字优先、复杂信息分层。 |
| AllTrails | [2023 iPhone App of the Year](https://www.apple.com/uk/newsroom/2023/11/apple-unveils-app-store-award-winners-the-best-apps-and-games-of-2023/) | 户外规划；自然配色、出发前的信息组织。 |
| Any Distance | [2023 Apple Design Award，Visuals and Graphics](https://developer.apple.com/design/awards/2023/)；[设计访谈](https://developer.apple.com/news/?id=uiiopcl8) | 运动距离；数字、单位、SF Symbols 的主次关系。 |
| Waterllama | [2022 Apple Design Award 入围，Delight and Fun](https://developer.apple.com/design/awards/2022/)；[官方界面](https://waterllama.com/) | 补水；少量输入、清楚的单位和主操作。 |
| Flighty | [2023 Apple Design Award，Interaction](https://developer.apple.com/design/awards/2023/)；[设计访谈](https://developer.apple.com/news/?id=970ncww4) | 行程节点；突出接下来要做的事。主要参考。 |
| Things 3 | [官方设计评价与两次 Apple Design Award](https://culturedcode.com/things/) | 列表编辑；留白、低干扰控件、明确的添加入口。主要参考。 |
| Crouton | [2024 Apple Design Award，Interaction](https://developer.apple.com/design/awards/2024/)；[设计访谈](https://developer.apple.com/news/?id=9x75y43e) | 计划与分步执行；把编辑和执行顺序组织清楚。 |
| Streaks | [Apple Design Award 获奖及官方界面](https://streaks.app/) | 健康习惯与自定义项目；少而明确的操作、容易辨认的状态。 |
| Lumy | [2025 Apple Design Award 入围，Delight and Fun](https://developer.apple.com/design/awards/2025/)；[官方界面](https://lumy.app/) | 户外时机规划、手表；克制配色和易扫读的信息。 |

主要组合是 **Gentler Streak 的运动健康气质 + Flighty 的节点顺序 + Things 的轻量编辑**。不复制品牌、插画、截图或专有图形，不移植社区、地图或运动记录功能。

## 视觉与交互规则

- 暖白背景、森林绿主操作、浅绿辅助区域，深色模式随系统适配。状态不只靠颜色表达。
- 概览显示最后补给里程和补给点数量；不是路线全长，不显示未经输入的路线、爬升、热量或补给建议。
- 编辑与里程预览分开，避免一页重复一长串内容。顺序号对应输入顺序。
- “本段距离”“到点提醒”始终显示标签，示例只是占位；显式提供删除入口。
- 底部固定一个发送主操作，未完成原因紧邻按钮。空白分段不允许发送，不自动填入测试数据。
- 使用条件和启动步骤收进说明面板。提交状态仍区分本机排程与真实手表同步。
- 使用原生 SwiftUI、SF Symbols、系统字体，保留 Dynamic Type、键盘完成按钮和 VoiceOver 标签。没有装饰性动效。

本次只修改界面与相关说明；每段距离、提示转换、本机保存和 WorkoutKit 提交流程沿用现有逻辑。

## 验证记录（2026-11-06）

- 原有 18 项 Swift Package 行为测试通过，iPhoneOS / iPhoneSimulator SDK 无签名构建通过，Swift 格式检查通过。
- iPhone 17 Pro / iOS 26.5 模拟器实际检查了首页、编辑/预览切换、50/150 米累计里程、补给点添加与删除、说明面板打开/关闭、本机排程反馈。空白临时补给点出现明确原因且不能发送，删除后恢复可发送。
- 通过安装更新后的启动确认本机保存的 50/100 米、Gel/Water 和两个补给点仍在。测试临时新增项已删除。
- 修正长列表滚动时内容进入状态栏的问题：品牌栏固定在顶部安全区域，发送区固定在底部。
- 浅色/深色主操作、辅助文字和警告文字的选定前景/背景配色，经相对亮度计算均达到 4.5:1；深色模式及超大字号尚未逐项进行模拟器视觉验收，不将配色计算等同于完整无障碍验收。
- 没有真实手表同步、骑行分段显示、声音、触感或续航验证，没有提交或推送代码。
