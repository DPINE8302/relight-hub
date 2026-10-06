// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "RELightHIDBridge",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "HIDCore", targets: ["HIDCore"]),
        .executable(name: "relight-hid-bridge", targets: ["RELightHIDBridge"]),
    ],
    targets: [
        .target(name: "HIDCore"),
        .executableTarget(name: "RELightHIDBridge", dependencies: ["HIDCore"]),
        .testTarget(name: "HIDCoreTests", dependencies: ["HIDCore"]),
    ]
)
