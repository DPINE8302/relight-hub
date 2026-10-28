import AppKit
import Darwin
import SwiftUI

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    var studio: Studio?
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if studio?.dirty == true {
            let restorePresentation = studio?.prepareOperatorModal()
            defer { restorePresentation?() }
            let alert = NSAlert(); alert.messageText = "Save project changes before quitting?"; alert.addButton(withTitle: "Save"); alert.addButton(withTitle: "Cancel"); alert.addButton(withTitle: "Discard Changes")
            switch alert.runModal() {
            case .alertFirstButtonReturn:
                if studio?.locked == true { studio?.stop() }
                studio?.save(); if studio?.dirty == true { return .terminateCancel }
            case .alertSecondButtonReturn: return .terminateCancel
            default: break
            }
        }
        studio?.shutdown(); return .terminateNow
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}

@main struct RELightApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var studio = Studio()
    init() { signal(SIGPIPE, SIG_IGN) }
    var body: some Scene {
        Window(Bundle.main.bundleIdentifier?.hasSuffix(".review") == true ? "RE:Light — Verification" : "RE:Light", id: "studio") {
            WorkspaceView(studio: studio).onAppear { delegate.studio = studio }
        }.defaultSize(width: 1240, height: 850)
            .windowStyle(.hiddenTitleBar)
            .commands {
                CommandGroup(replacing: .newItem) { Button("Open Project…") { studio.openProject() }.keyboardShortcut("o"); Button("Replace Full Film…") { studio.replaceFullFilm() }.disabled(studio.locked); Button("Open Included Experience") { studio.openIncludedExperience() }.disabled(studio.locked); Button("Save Project") { studio.save() }.keyboardShortcut("s").disabled(studio.locked); Button("Export Portable Project…") { studio.exportProject() }.keyboardShortcut("s", modifiers: [.command, .shift]).disabled(studio.locked) }
                CommandGroup(replacing: .undoRedo) { Button("Undo") { studio.undo() }.keyboardShortcut("z").disabled(studio.undoHistory.isEmpty || studio.locked); Button("Redo") { studio.redo() }.keyboardShortcut("z", modifiers: [.command, .shift]).disabled(studio.redoHistory.isEmpty || studio.locked) }
                CommandMenu("Playback") {
                    Button("Play / Pause Preview") { studio.toggleFilmPreview() }.disabled((studio.locked && !studio.previewingFilm) || studio.state == .preparing)
                    Button("Stop Preview") { studio.stopFilmPreview() }.disabled(!studio.previewingFilm)
                    Divider()
                    Button("Previous Frame") { studio.stepFrames(-1) }.disabled(!studio.canSeek)
                    Button("Next Frame") { studio.stepFrames(1) }.disabled(!studio.canSeek)
                    Button("Jump to Recording") { studio.jumpToRecording() }.disabled(!studio.canSeek || studio.scene.capture == nil)
                    Button("Jump to Dream Voice") { studio.jumpToDream() }.disabled(!studio.canSeek || studio.scene.cues.isEmpty)
                }
                CommandMenu("Experience") {
                    Button("Start / Pause / Resume") { studio.togglePlayback() }.keyboardShortcut(.return, modifiers: .command)
                    Button("Stop & Clear") { studio.stop() }.keyboardShortcut(".", modifiers: .command)
                    Divider(); Button("Record") { studio.recordAtGate() }.disabled(studio.state != .gate)
                    Button("Continue without recording") { studio.declineAtGate() }.disabled(studio.state != .gate && studio.state != .countdown)
                    Toggle("Mute Narrator", isOn: Binding(get: { studio.narratorMuted }, set: { studio.setNarratorMuted($0) }))
                    Divider(); Button("Open Audience Output") { studio.openAudience() }; Button("Close Audience Output") { studio.closeAudience() }.keyboardShortcut(.escape, modifiers: .command); Button("Devices…") { studio.showDevices = true }
                }
                CommandGroup(replacing: .help) { Button("RE:Light Help & Troubleshooting") { studio.showHelp = true } }
            }
    }
}
