import AppKit
import Foundation
@testable import RELightMac

// Device identities are captured once for this headless test process. Tests that
// exercise topology replace the snapshot explicitly rather than polling live
// hardware and racing other capture tests.
@MainActor enum TestAudioInventory {
    static let snapshot = DeviceCatalog.devices()
}

@MainActor func makeTestStudio(storageRoot: URL, startHardware: Bool = false, preferences: UserDefaults? = nil, scanDevices: Bool = false) -> Studio {
    let studio = Studio(storageRoot: storageRoot, startHardware: startHardware, preferences: preferences, scanDevices: false)
    studio.applyDeviceInventory(TestAudioInventory.snapshot, screens: NSScreen.screens)
    return studio
}

@MainActor extension NativeAudio {
    func configure(input: String, output: String) throws {
        try configure(input: input, output: output, inventory: TestAudioInventory.snapshot)
    }
}
