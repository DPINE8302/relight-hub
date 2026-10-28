import AppKit
import IOKit.pwr_mgt
import SwiftUI

/// App-owned idle protection covers film, pauses and recording screens.
final class ExhibitionAwake {
    private let createAssertion: (inout IOPMAssertionID) -> IOReturn
    private(set) var assertionID: IOPMAssertionID?
    private var activity: NSObjectProtocol?
    var isActive: Bool { assertionID != nil }
    init(createAssertion: @escaping (inout IOPMAssertionID) -> IOReturn = { id in
        IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleDisplaySleep as CFString,
            IOPMAssertionLevel(kIOPMAssertionLevelOn), "RE:Light exhibition playback and recording" as CFString, &id)
    }) { self.createAssertion = createAssertion }
    func start() throws {
        guard assertionID == nil else { return }
        var id: IOPMAssertionID = 0
        let status = createAssertion(&id)
        guard status == kIOReturnSuccess else { throw AudioFailure("macOS could not enable exhibition awake protection (\(status)). Check Lock Screen and Battery settings.") }
        assertionID = id
        activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiated], reason: "RE:Light exhibition playback and recording")
    }
    func stop() {
        if let activity { ProcessInfo.processInfo.endActivity(activity); self.activity = nil }
        if let assertionID { IOPMAssertionRelease(assertionID); self.assertionID = nil }
    }
    deinit { stop() }
}

final class CleanAudiencePanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
    convenience init(frame: NSRect) {
        self.init(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        isReleasedWhenClosed = false; backgroundColor = .black; isOpaque = true
        hasShadow = false; isMovable = false; hidesOnDeactivate = false; canHide = false
        isFloatingPanel = true; acceptsMouseMovedEvents = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        animationBehavior = .none
        level = .screenSaver
    }
}

/// A transparent cursor only over audience content; no global hide counter or input capture.
@MainActor final class CleanAudienceSurface: NSView {
    private let hosting: NSHostingView<AudienceView>
    private var tracking: NSTrackingArea?
    private var cursorIsTransparent = false
    private let mediaCursor = NSCursor(image: NSImage(size: NSSize(width: 16, height: 16), flipped: false) { _ in true }, hotSpot: .zero)
    init(studio: Studio) {
        hosting = NSHostingView(rootView: AudienceView(studio: studio))
        super.init(frame: .zero)
        wantsLayer = true; layer?.backgroundColor = NSColor.black.cgColor
        hosting.autoresizingMask = [.width, .height]
        addSubview(hosting)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) unavailable") }
    override func layout() { super.layout(); hosting.frame = bounds }
    override func updateTrackingAreas() {
        if let tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(rect: .zero, options: [.activeAlways, .inVisibleRect, .cursorUpdate, .mouseEnteredAndExited], owner: self)
        tracking = area; addTrackingArea(area); super.updateTrackingAreas()
    }
    override func cursorUpdate(with event: NSEvent) { mediaCursor.set(); cursorIsTransparent = true }
    override func mouseEntered(with event: NSEvent) { mediaCursor.set(); cursorIsTransparent = true }
    override func mouseExited(with event: NSEvent) { restoreCursor() }
    func restoreCursor() { if cursorIsTransparent { NSCursor.arrow.set(); cursorIsTransparent = false } }
    func restoreMediaCursorIfInside() { if let window, window.frame.contains(NSEvent.mouseLocation) { mediaCursor.set(); cursorIsTransparent = true } }
    override func viewWillMove(toWindow newWindow: NSWindow?) { if newWindow == nil { restoreCursor() }; super.viewWillMove(toWindow: newWindow) }
}
