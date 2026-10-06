// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "RELightNative",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "RELight", targets: ["RELightMac"]), .library(name: "RELightCore", targets: ["RELightCore"])],
    targets: [
        .target(name: "RELightCore"),
        .executableTarget(name: "RELightMac", dependencies: ["RELightCore"], swiftSettings: [.swiftLanguageMode(.v5)]),
        .testTarget(name: "RELightCoreTests", dependencies: ["RELightCore"]),
        .testTarget(name: "RELightNativeTests", dependencies: ["RELightMac", "RELightCore"], swiftSettings: [.swiftLanguageMode(.v5)])
    ]
)
