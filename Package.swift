// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "Kairos",
  platforms: [.macOS(.v15), .iOS(.v18)],
  products: [.library(name: "KairosCore", targets: ["KairosCore"])],
  targets: [
    .target(name: "KairosCore", path: "KairosCore"),
    .testTarget(name: "KairosCoreTests", dependencies: ["KairosCore"]),
  ]
)
