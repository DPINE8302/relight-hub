import AppKit
import Darwin
import SwiftUI

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    var studio: Studio?
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if studio?.dirty == true {
            let alert = NSAlert(); alert.messageText = "Save project changes before quitting?"; alert.addButton(withTitle: "Save"); alert.addButton(withTitle: "Cancel"); alert.addButton(withTitle: "Discard Changes")
            switch alert.runModal() {
            case .alertFirstButtonReturn: studio?.save(); if studio?.dirty == true { return .terminateCancel }
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
        Window("RE:Light", id: "studio") {
            WorkspaceView(studio: studio).onAppear { delegate.studio = studio }
        }.defaultSize(width: 1240, height: 850)
            .windowStyle(.hiddenTitleBar)
            .commands {
                CommandGroup(replacing: .newItem) { Button("Open Project…") { studio.openProject() }.keyboardShortcut("o"); Button("Open Draft 1 Rehearsal") { studio.openDraftExample() }.disabled(studio.locked); Button("Save Project") { studio.save() }.keyboardShortcut("s").disabled(studio.locked); Button("Export Portable Project…") { studio.exportProject() }.keyboardShortcut("s", modifiers: [.command, .shift]).disabled(studio.locked) }
                CommandGroup(replacing: .undoRedo) { Button("Undo") { studio.undo() }.keyboardShortcut("z").disabled(studio.undoHistory.isEmpty || studio.locked); Button("Redo") { studio.redo() }.keyboardShortcut("z", modifiers: [.command, .shift]).disabled(studio.redoHistory.isEmpty || studio.locked) }
                CommandMenu("Experience") {
                    Button("Start / Pause / Resume") { studio.togglePlayback() }.keyboardShortcut(.return, modifiers: .command)
                    Button("Stop & Clear") { studio.stop() }.keyboardShortcut(".", modifiers: .command)
                    Divider(); Button("Consent & Record") { studio.recordAtGate() }.disabled(studio.state != .gate)
                    Button("Continue without recording") { studio.declineAtGate() }.disabled(studio.state != .gate)
                    Divider(); Button("Open Audience Output") { studio.openAudience() }; Button("Devices…") { studio.showDevices = true }
                }
                CommandGroup(replacing: .help) { Button("RE:Light Help & Troubleshooting") { studio.showHelp = true } }
            }
    }
}
