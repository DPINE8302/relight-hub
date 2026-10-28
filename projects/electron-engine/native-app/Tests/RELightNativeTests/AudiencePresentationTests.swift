import AppKit
import Foundation
import IOKit.pwr_mgt
import Testing
@testable import RELightMac

@Test @MainActor func projectorPanelCoversTheWholeFrameAboveSystemBarsWithoutTakingFocus() {
    _ = NSApplication.shared
    let frame = NSRect(x: -1920, y: 120, width: 1920, height: 1080)
    let panel = CleanAudiencePanel(frame: frame)
    defer { panel.close() }
    #expect(panel.frame == frame)
    #expect(!panel.styleMask.contains(.titled))
    #expect(!panel.styleMask.contains(.closable))
    #expect(panel.styleMask.contains(.nonactivatingPanel))
    #expect(panel.toolbar == nil && !panel.hasShadow)
    #expect(panel.level.rawValue > NSWindow.Level.mainMenu.rawValue)
    #expect(panel.level.rawValue > Int(CGWindowLevelForKey(.dockWindow)))
    #expect(panel.collectionBehavior.contains(.canJoinAllSpaces))
    #expect(panel.collectionBehavior.contains(.fullScreenAuxiliary))
    #expect(!panel.hidesOnDeactivate)
    #expect(!panel.canBecomeKey && !panel.canBecomeMain)
    let resized = NSRect(x: -2560, y: 0, width: 2560, height: 1440)
    panel.setFrame(resized, display: false)
    #expect(panel.frame == resized)
}

@Test func exhibitionAwakeGuardCreatesAnActualDisplayAssertionAndReleasesIt() throws {
    let awake = ExhibitionAwake()
    #expect(!awake.isActive)
    try awake.start()
    let id = try #require(awake.assertionID)
    let properties = try #require(IOPMAssertionCopyProperties(id)?.takeRetainedValue() as? [String: Any])
    #expect(properties[kIOPMAssertionTypeKey as String] as? String == kIOPMAssertionTypePreventUserIdleDisplaySleep)
    #expect((properties[kIOPMAssertionLevelKey as String] as? NSNumber)?.intValue == Int(kIOPMAssertionLevelOn))
    try awake.start()
    #expect(awake.assertionID == id)
    awake.stop()
    #expect(!awake.isActive)
    #expect(IOPMAssertionCopyProperties(id) == nil)
    awake.stop()
}

@Test @MainActor func awakeProtectionSpansPausesCaptureAndPreviewAndCannotRestartAfterShutdown() {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    #expect(!studio.awakeProtectionActive)
    for state: RunState in [.preparing, .playing, .paused, .gate, .countdown, .recording] {
        studio.state = state
        #expect(studio.awakeProtectionActive)
    }
    studio.state = .finished
    #expect(!studio.awakeProtectionActive)
    studio.state = .idle; studio.auditioning = true
    #expect(studio.awakeProtectionActive)
    studio.auditioning = false
    #expect(!studio.awakeProtectionActive)
    studio.state = .playing; studio.shutdown()
    #expect(!studio.awakeProtectionActive)
    studio.state = .paused
    #expect(!studio.awakeProtectionActive)
}

@Test @MainActor func audienceExitShortcutDoesNotInterceptForceQuitOrPlainEscape() {
    func event(_ flags: NSEvent.ModifierFlags) -> NSEvent {
        NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: flags, timestamp: 0, windowNumber: 0, context: nil, characters: "\u{1b}", charactersIgnoringModifiers: "\u{1b}", isARepeat: false, keyCode: 53)!
    }
    #expect(Studio.isAudienceExitEvent(event(.command)))
    #expect(!Studio.isAudienceExitEvent(event([.command, .option])))
    #expect(!Studio.isAudienceExitEvent(event([])))
    #expect(!Studio.isAudienceExitEvent(event([.command, .shift])))
}

@Test @MainActor func failedAwakeAcquisitionStopsTheRunAndNeverShowsAudienceOutput() {
    _ = NSApplication.shared
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let denied = ExhibitionAwake(createAssertion: { _ in kIOReturnError })
    let studio = Studio(storageRoot: root, startHardware: false, scanDevices: false, awakeProtection: denied)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.beginRun(consented: false)
    #expect(studio.state == .idle)
    #expect(!studio.awakeProtectionActive)
    #expect(studio.issue?.contains("awake protection") == true)
    studio.openAudience()
    #expect(!studio.audienceOutputVisible)
    #expect(!studio.awakeProtectionActive)
    #expect(studio.issue?.contains("awake protection") == true)
}

@Test @MainActor func displayCalibrationCannotCoverAnActiveShow() {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    for state: RunState in [.preparing, .playing, .paused, .gate, .countdown, .recording] {
        studio.state = state
        studio.openAudience(identify: true)
        #expect(!studio.identifyingDisplay)
        #expect(!studio.audienceOutputVisible)
    }
}
