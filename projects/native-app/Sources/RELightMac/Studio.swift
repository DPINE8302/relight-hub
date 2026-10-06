import AppKit
import AVFoundation
import Combine
import SwiftUI
import IOKit.ps
import RELightCore
import UniformTypeIdentifiers

enum RunState: String { case idle = "Ready", preparing = "Preparing", playing = "Running", paused = "Paused", gate = "Waiting for consent", recording = "Recording", finished = "Complete" }
enum Workspace: String, CaseIterable { case run = "Run", edit = "Edit" }
enum SetupKind: String, CaseIterable { case mac = "This Mac", exhibition = "Exhibition" }
struct StudioEvent: Identifiable { let id = UUID(); let time = Date(); let text: String }
struct MediaCheck { let valid: Bool; let detail: String }

@MainActor final class Studio: ObservableObject {
    @Published var project = Project.starter
    @Published var workspace: Workspace = .run
    @Published var setup: SetupKind = .mac
    @Published var selectedScene = 0
    @Published var selectedCue: UUID?
    @Published var state: RunState = .idle
    @Published var frame = 0
    @Published var meter: Double = 0
    @Published var peak: Double = 0
    @Published var recordingSeconds: Double = 0
    @Published var takeSeconds: Double = 0
    @Published var dirty = false
    @Published var showDevices = false
    @Published var showHelp = false
    @Published var showConsent = false
    @Published var issue: String?
    @Published var note = "Project ready. Choose devices, then start a rehearsal."
    @Published var inputUID = ""
    @Published var outputUID = ""
    @Published var screenID = ""
    @Published var devices: [SoundDevice] = []
    @Published var screens: [NSScreen] = []
    @Published var microphonePassed = false
    @Published var speakersPassed = false
    @Published var projectorPassed = false
    @Published var mediaChecks: [UUID: MediaCheck] = [:]
    @Published var events: [StudioEvent] = []
    @Published var speed: Double = 1
    @Published var undoHistory: [Project] = []
    @Published var redoHistory: [Project] = []
    @Published var auditioning = false
    @Published var identifyingDisplay = false
    @Published var permission = AVCaptureDevice.authorizationStatus(for: .audio)
    let player = AVPlayer()
    let audio = NativeAudio()
    let hardware = Hardware()
    private(set) var root: URL
    private var file: URL
    private var liveProject: Project?
    private var timer: Timer?
    private var topologyTimer: Timer?
    private var clockStart = ProcessInfo.processInfo.systemUptime
    private var clockPosition: Double = 0
    private var captureStarted = Date()
    private var captureDuration: Double = 6
    private var captureForTest = false
    private var captureManual = false
    var isManualRecording: Bool { captureManual }
    private var gateResolved = Set<Int>()
    private var captureFired = false
    private var consent = false
    private var ledger = CueLedger()
    private var activeCue: VoiceCue?
    private var auditionStart = ProcessInfo.processInfo.systemUptime
    private var generation = 0
    private var audience: NSWindow?
    private var meterTestStart: Date?
    private var meterTestPeak: Double = 0
    @Published private(set) var tonePlayed = false
    private var mediaSeekReady = true
    private var lastUIPublish = 0.0
    private var preparationStarted = 0.0
    private var previewToken = UUID()
    private var hardwareSubscription: AnyCancellable?
    private var playerObservation: NSKeyValueObservation?

    var locked: Bool { ![.idle, .finished].contains(state) || auditioning }
    var activeProject: Project { liveProject ?? project }
    var scene: RELightCore.Scene { activeProject.scenes[min(max(0, selectedScene), activeProject.scenes.count - 1)] }
    var globalFrame: Int { activeProject.globalFrame(scene: selectedScene, localFrame: frame) }
    var timecode: String { activeProject.rate.timecode(globalFrame) }
    var isBlack: Bool { state == .gate || (state == .recording && !captureForTest && scene.capture?.trigger == .gate) || (activeProject.blackFromFrame.map { globalFrame >= $0 } ?? false) }
    var hasVideo: Bool { scene.media != nil && mediaChecks[scene.id]?.valid == true }
    var selectedVoice: VoiceCue? { project.scenes[selectedScene].cues.first { $0.id == selectedCue } }
    var missingFilms: Int { project.scenes.filter { $0.media == nil || mediaChecks[$0.id]?.valid != true }.count }
    var externalScreen: NSScreen? { screens.first { Self.id($0) == screenID } }
    var configuredInputMissing: Bool { !inputUID.isEmpty && !devices.contains { $0.uid == inputUID && $0.input } }
    var configuredOutputMissing: Bool { !outputUID.isEmpty && !devices.contains { $0.uid == outputUID && $0.output } }
    var blockers: [String] {
        var result = project.validation()
        if configuredInputMissing { result.append("The saved microphone is disconnected. Choose a device or Continue with this Mac.") }
        if configuredOutputMissing { result.append("The saved speakers are disconnected. Choose a device or Continue with this Mac.") }
        if setup == .exhibition {
            if missingFilms > 0 { result.append("\(missingFilms) scenes need valid film") }
            if project.scenes.contains(where: { $0.draft }) { result.append("Approve final media for every scene in Edit") }
            if externalScreen == nil || CGDisplayIsBuiltin(UInt32(screenID) ?? 0) != 0 { result.append("Select an external projector display") }
            if !projectorPassed { result.append("Confirm the picture on the projector") }
            if !speakersPassed { result.append("Test and confirm the intended speakers") }
            if project.scenes.contains(where: { $0.capture != nil }) && !microphonePassed { result.append("Test the selected microphone") }
            for role in ["RECORD_BUTTON", "CHOICE_BUTTON"] where !hardware.connected(role) || !hardware.tested.contains(role) { result.append("Assign and test \(role == "RECORD_BUTTON" ? "Record" : "Continue / Decline") control") }
            if !Self.onACPower { result.append("Connect the Mac to power") }
        }
        return result
    }
    static func id(_ screen: NSScreen) -> String { String((screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0) }
    static var onACPower: Bool {
        guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(), let source = IOPSGetProvidingPowerSourceType(info)?.takeRetainedValue() else { return false }
        return source as String == kIOPSACPowerValue
    }

    init(storageRoot: URL? = nil, startHardware: Bool = true) {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("RELight Native")
        root = storageRoot ?? support.appendingPathComponent("Starter Project"); file = root.appendingPathComponent("experience.relight")
        try? FileManager.default.createDirectory(at: root.appendingPathComponent("media"), withIntermediateDirectories: true)
        let bundled = Bundle.main.resourceURL?.appendingPathComponent("media/Scene01_Draft1_480p_v5.mp4")
        if let bundled, FileManager.default.fileExists(atPath: bundled.path), !FileManager.default.fileExists(atPath: root.appendingPathComponent("media/Scene01_Draft1_480p_v5.mp4").path) { try? FileManager.default.copyItem(at: bundled, to: root.appendingPathComponent("media/Scene01_Draft1_480p_v5.mp4")) }
        if storageRoot == nil, let remembered = UserDefaults.standard.string(forKey: "native.project"), FileManager.default.fileExists(atPath: remembered) { file = URL(fileURLWithPath: remembered); root = file.deletingLastPathComponent() }
        if let data = try? Data(contentsOf: file), let p = try? JSONDecoder().decode(Project.self, from: data), p.validation().isEmpty { project = p }
        inputUID = UserDefaults.standard.string(forKey: "native.input") ?? ""
        outputUID = UserDefaults.standard.string(forKey: "native.output") ?? ""
        screenID = UserDefaults.standard.string(forKey: "native.screen") ?? ""
        if !FileManager.default.fileExists(atPath: file.path), let data = try? JSONEncoder().encode(project) { try? data.write(to: file, options: .atomic) }
        refreshDevices()
        if startHardware { hardware.start() }
        hardware.onInput = { [weak self] role in
            guard let self else { return }
            if role == "RECORD_BUTTON", self.state == .gate { self.recordAtGate() }
            else if role == "RECORD_BUTTON", self.state == .recording, Date().timeIntervalSince(self.captureStarted) >= 0.2 { self.finishRecording() }
            else if role == "CHOICE_BUTTON", self.state == .gate { self.declineAtGate() }
        }
        hardware.onDisconnect = { [weak self] in if self?.setup == .exhibition && self?.locked == true { self?.fail("An assigned USB control disconnected. Reconnect it and test before restarting.") } }
        hardwareSubscription = hardware.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        timer = Timer.scheduledTimer(withTimeInterval: 0.01, repeats: true) { [weak self] _ in Task { @MainActor in self?.tick() } }
        topologyTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in Task { @MainActor in self?.refreshDevices() } }
        playerObservation = player.observe(\.status) { [weak self] player, _ in
            if player.status == .failed { Task { @MainActor in self?.fail("Video playback failed. Validate the scene media before restarting.") } }
        }
        Task { await validateMedia() }
        log("Native workspace opened. Participant audio is never saved.")
    }
    func log(_ text: String) { events.insert(StudioEvent(text: text), at: 0); if events.count > 100 { events.removeLast() } }
    func fail(_ text: String) { stop(clearMessage: false); issue = text; note = text; log(text) }
    func refreshDevices() {
        let newDevices = DeviceCatalog.devices(), newScreens = NSScreen.screens
        let audioLost = devices.contains { $0.uid == inputUID || $0.uid == outputUID } && (( !inputUID.isEmpty && !newDevices.contains { $0.uid == inputUID }) || (!outputUID.isEmpty && !newDevices.contains { $0.uid == outputUID }))
        let screenLost = screens.contains { Self.id($0) == screenID } && !newScreens.contains { Self.id($0) == screenID }
        devices = newDevices; screens = newScreens; permission = AVCaptureDevice.authorizationStatus(for: .audio)
        if audioLost { microphonePassed = false; speakersPassed = false }
        if screenLost { projectorPassed = false; audience?.close(); audience = nil }
        if locked && (audioLost || (screenLost && setup == .exhibition)) { fail("A selected device disconnected. Reconnect it or continue a new rehearsal with this Mac.") }
        hardware.active(NSApplication.shared.isActive || locked)
    }
    func continueWithMac() {
        guard !locked else { return }
        closeAudience(); setup = .mac
        inputUID = devices.first { $0.input && $0.uid.lowercased().contains("builtin") }?.uid ?? devices.first { $0.input && $0.name.contains("MacBook") }?.uid ?? ""
        outputUID = devices.first { $0.output && $0.uid.lowercased().contains("builtin") }?.uid ?? ""
        screenID = NSScreen.main.map(Self.id) ?? ""
        // Local substitutes do not overwrite the saved exhibition kit.
        microphonePassed = false; speakersPassed = false; projectorPassed = false; tonePlayed = false; issue = nil
        note = "Using this Mac. Your project and saved exhibition assignments are unchanged."
        audio.stopAll(); log(note)
    }
    func chooseExhibition() {
        guard !locked else { return }
        closeAudience(); setup = .exhibition
        inputUID = UserDefaults.standard.string(forKey: "native.input") ?? ""
        outputUID = UserDefaults.standard.string(forKey: "native.output") ?? ""
        screenID = UserDefaults.standard.string(forKey: "native.screen") ?? ""
        microphonePassed = false; speakersPassed = false; projectorPassed = false; tonePlayed = false; hardware.tested.removeAll(); audio.stopAll()
    }
    func deviceChanged() {
        guard !locked else { return }
        microphonePassed = false; speakersPassed = false; projectorPassed = false; tonePlayed = false; audio.stopAll(); closeAudience()
        if setup == .exhibition {
            UserDefaults.standard.set(inputUID, forKey: "native.input"); UserDefaults.standard.set(outputUID, forKey: "native.output"); UserDefaults.standard.set(screenID, forKey: "native.screen")
        }
    }
    func allowMicrophone() {
        permission = AVCaptureDevice.authorizationStatus(for: .audio)
        note = "Waiting for macOS microphone permission…"
        AVCaptureDevice.requestAccess(for: .audio) { [weak self] allowed in Task { @MainActor in self?.permission = AVCaptureDevice.authorizationStatus(for: .audio); self?.note = allowed ? "Microphone access allowed. Test your input." : "Microphone access denied. Open System Settings → Privacy & Security → Microphone." } }
    }
    func microphoneSettings() { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")!) }
    func testMicrophone() {
        guard !locked else { return }
        do {
            try audio.configure(input: inputUID, output: outputUID); try audio.prepareMicrophone()
            meterTestPeak = 0; meterTestStart = Date(); note = "Speak normally for two seconds."
        } catch { issue = error.localizedDescription }
    }
    func testSpeakers() {
        guard !locked else { return }
        do { try audio.configure(input: inputUID, output: outputUID); try audio.testTone(); tonePlayed = true; note = "Did you hear the tone through the intended speakers?" } catch { issue = error.localizedDescription }
    }
    func confirmSpeakers() { guard tonePlayed else { return }; speakersPassed = true; note = "Speaker test confirmed"; log(note) }

    func mutate(_ change: (inout Project) -> Void) {
        guard !locked else { return }
        var changed = project
        change(&changed)
        guard changed != project else { return }
        undoHistory.append(project); if undoHistory.count > 100 { undoHistory.removeFirst() }; redoHistory = []
        project = changed; dirty = true; issue = nil
    }
    func mutateCue(_ change: (inout VoiceCue) -> Void) {
        guard let id = selectedCue, let i = project.scenes[selectedScene].cues.firstIndex(where: { $0.id == id }) else { return }
        mutate { change(&$0.scenes[selectedScene].cues[i]) }
    }
    func undo() { guard !locked, let p = undoHistory.popLast() else { return }; redoHistory.append(project); project = p; dirty = true }
    func redo() { guard !locked, let p = redoHistory.popLast() else { return }; undoHistory.append(project); project = p; dirty = true }
    func addCue() {
        let cue = VoiceCue(startFrame: min(frame, max(0, scene.frames - 144)), lengthFrames: min(144, scene.frames))
        mutate { $0.scenes[selectedScene].cues.append(cue) }; selectedCue = cue.id
    }
    func removeCue() { guard let id = selectedCue else { return }; mutate { $0.scenes[selectedScene].cues.removeAll { $0.id == id } }; selectedCue = nil }
    func selectScene(_ index: Int) {
        guard !locked, project.scenes.indices.contains(index) else { return }
        selectedScene = index; selectedCue = project.scenes[index].cues.first?.id; frame = 0; loadPreview()
    }
    func seek(_ value: Int) {
        guard state != .recording && state != .gate && state != .preparing else { return }
        frame = max(0, min(scene.frames - 1, value)); audio.stopVoice(); activeCue = nil
        ledger.skip(through: frame, cues: scene.cues)
        clockPosition = activeProject.rate.seconds(frame); clockStart = ProcessInfo.processInfo.systemUptime
        player.seek(to: CMTime(value: Int64((frame + scene.mediaInFrame) * activeProject.rate.denominator), timescale: Int32(activeProject.rate.numerator)), toleranceBefore: .zero, toleranceAfter: .zero)
    }
    func loadPreview() {
        player.pause(); player.replaceCurrentItem(with: nil)
        if let path = scene.media, let url = project.assetURL(path, root: root), mediaChecks[scene.id]?.valid == true {
            player.replaceCurrentItem(with: AVPlayerItem(url: url))
            player.seek(to: CMTime(seconds: project.rate.seconds(scene.mediaInFrame), preferredTimescale: 60000), toleranceBefore: .zero, toleranceAfter: .zero)
        }
        player.audioOutputDeviceUniqueID = outputUID.isEmpty ? nil : outputUID; player.volume = Float(project.filmLevel)
    }
    func validateMedia() async {
        let token = UUID(); previewToken = token
        let checkedProject = project, checkedRoot = root
        var checks: [UUID: MediaCheck] = [:]
        for s in checkedProject.scenes {
            guard let path = s.media else { checks[s.id] = MediaCheck(valid: false, detail: "Film not supplied · rehearsal text available"); continue }
            guard let url = checkedProject.assetURL(path, root: checkedRoot), FileManager.default.fileExists(atPath: url.path) else { checks[s.id] = MediaCheck(valid: false, detail: "Media missing or outside project"); continue }
            do {
                let asset = AVURLAsset(url: url)
                let duration = try await asset.load(.duration), tracks = try await asset.loadTracks(withMediaType: .video), playable = try await asset.load(.isPlayable)
                guard let track = tracks.first, playable else { throw AudioFailure("Not a playable video") }
                let rate = try await track.load(.nominalFrameRate)
                let lengthMatch = duration.seconds * checkedProject.rate.fps + 1.1 >= Double(s.mediaInFrame + s.frames)
                let rateMatch = abs(Double(rate) - checkedProject.rate.fps) < 0.05
                let valid = lengthMatch && rateMatch
                checks[s.id] = MediaCheck(valid: valid, detail: valid ? "\(s.frames) frames from source \(s.mediaInFrame) · \(rate) fps · playable" : "Needs source frames \(s.mediaInFrame)–\(s.mediaInFrame + s.frames) at \(checkedProject.rate.fps) fps; found \(Int((duration.seconds * Double(rate)).rounded())) frames at \(rate) fps")
            } catch { checks[s.id] = MediaCheck(valid: false, detail: error.localizedDescription) }
        }
        guard previewToken == token, project == checkedProject, root == checkedRoot else { return }
        mediaChecks = checks
        if !locked { loadPreview() }
    }
    func importMedia() {
        guard !locked else { return }
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.movie]; panel.message = "Choose the finished scene segment (\(scene.frames) frames). Original media is preserved."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let name = UUID().uuidString + "-" + url.lastPathComponent
            let destination = root.appendingPathComponent("media/" + name)
            try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: url, to: destination)
            mutate { $0.scenes[selectedScene].media = "media/" + name; $0.scenes[selectedScene].draft = true }
            Task { await validateMedia() }
        } catch { issue = error.localizedDescription }
    }
    func save() {
        guard !locked else { return }
        let errors = project.validation(); guard errors.isEmpty else { issue = errors.joined(separator: "\n"); return }
        do {
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            if FileManager.default.fileExists(atPath: file.path) { try? FileManager.default.copyItem(at: file, to: file.deletingPathExtension().appendingPathExtension("backup-\(Int(Date().timeIntervalSince1970)).relight")) }
            try encoder.encode(project).write(to: file, options: .atomic); dirty = false
            UserDefaults.standard.set(file.path, forKey: "native.project"); note = "Project saved. Participant voice is excluded."; log(note)
        } catch { issue = error.localizedDescription }
    }
    func exportProject() {
        guard !locked, project.validation().isEmpty else { issue = "Fix project validation before exporting"; return }
        let panel = NSSavePanel(); panel.nameFieldStringValue = "RELight Project"; panel.message = "Export a portable folder containing the project and referenced media. Participant voice is excluded."
        guard panel.runModal() == .OK, let destination = panel.url else { return }
        guard !FileManager.default.fileExists(atPath: destination.path) else { issue = "Choose a new folder name to preserve existing files"; return }
        do {
            try FileManager.default.createDirectory(at: destination.appendingPathComponent("media"), withIntermediateDirectories: true)
            for path in Set(project.scenes.compactMap(\.media)) {
                guard let source = project.assetURL(path, root: root), let target = project.assetURL(path, root: destination) else { throw AudioFailure("Unsafe media path") }
                try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true); try FileManager.default.copyItem(at: source, to: target)
            }
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(project).write(to: destination.appendingPathComponent("experience.relight"), options: .atomic)
            note = "Portable project exported"; NSWorkspace.shared.activateFileViewerSelecting([destination])
        } catch { issue = "Export incomplete: \(error.localizedDescription). Original project is unchanged." }
    }
    func openProject() {
        guard !locked else { return }
        if dirty { let alert = NSAlert(); alert.messageText = "Save your changes first?"; alert.addButton(withTitle: "Save"); alert.addButton(withTitle: "Cancel"); if alert.runModal() != .alertFirstButtonReturn { return }; save(); if dirty { return } }
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.data]; panel.message = "Open experience.relight from a project folder"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        loadProject(url)
    }
    func loadProject(_ url: URL) {
        guard !locked else { return }
        do {
            let data = try Data(contentsOf: url); guard data.count < 2_000_000 else { throw AudioFailure("Project file is too large") }
            let p = try JSONDecoder().decode(Project.self, from: data), errors = p.validation(); guard errors.isEmpty else { throw AudioFailure(errors.joined(separator: "\n")) }
            audio.stopAll(); closeAudience(); liveProject = nil; state = .idle; takeSeconds = 0; issue = nil; project = p; file = url; root = url.deletingLastPathComponent(); selectedScene = 0; selectedCue = nil; frame = 0; undoHistory = []; redoHistory = []; dirty = false
            UserDefaults.standard.set(url.path, forKey: "native.project"); Task { await validateMedia() }; note = "Project opened. Assign this machine’s devices before exhibition use."
        } catch { issue = error.localizedDescription }
    }

    func openDraftExample() {
        guard !locked else { return }
        if dirty { save(); if dirty { return } }
        guard let bundled = Bundle.main.resourceURL?.appendingPathComponent("Examples/Draft1"), FileManager.default.fileExists(atPath: bundled.path) else { issue = "Draft example is not included in this build"; return }
        let destination = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("RELight Native/Draft 1 Rehearsal")
        do {
            if !FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.copyItem(at: bundled, to: destination) }
            loadProject(destination.appendingPathComponent("experience.relight"))
            note = "Draft 1 loaded. Scene boundaries are provisional; adjust the source in-point and duration in Edit. Wake still needs film."
        } catch { issue = error.localizedDescription }
    }

    func start() {
        guard !locked else { return }
        if !blockers.isEmpty { issue = blockers.first; showDevices = true; return }
        if project.scenes.contains(where: { $0.capture?.trigger == .automatic }) { showConsent = true; return }
        beginRun(consented: false)
    }
    func beginRun(consented: Bool) {
        consent = consented; identifyingDisplay = false; issue = nil; selectedScene = 0; frame = 0; liveProject = project; gateResolved = []; generation += 1
        audio.stopAll(); takeSeconds = 0
        do { try audio.configure(input: inputUID, output: outputUID) } catch { fail(error.localizedDescription); return }
        if setup == .exhibition { openAudience() }
        enterScene(0)
    }
    private func enterScene(_ index: Int) {
        guard activeProject.scenes.indices.contains(index) else { finishRun(); return }
        selectedScene = index; frame = 0; ledger.reset(); captureFired = false; audio.stopVoice(); activeCue = nil
        player.pause(); player.replaceCurrentItem(with: nil); mediaSeekReady = true; clockPosition = 0; preparationStarted = ProcessInfo.processInfo.systemUptime; state = .preparing
        if let path = scene.media, let url = activeProject.assetURL(path, root: root), mediaChecks[scene.id]?.valid == true {
            player.replaceCurrentItem(with: AVPlayerItem(url: url))
            mediaSeekReady = false
            let token = UUID(); previewToken = token
            player.seek(to: CMTime(seconds: activeProject.rate.seconds(scene.mediaInFrame), preferredTimescale: 60000), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] completed in
                Task { @MainActor in
                    guard let self, self.previewToken == token, self.state == .preparing else { return }
                    if completed { self.mediaSeekReady = true } else { self.fail("Video in-point could not be prepared") }
                }
            }
        } else if setup == .exhibition { fail("Scene media is unavailable"); return }
        player.audioOutputDeviceUniqueID = outputUID.isEmpty ? nil : outputUID; player.volume = Float(activeProject.filmLevel)
        log("Preparing scene \(index + 1): \(scene.name)")
        if scene.capture?.trigger == .automatic { speed = 1 }
        if consent && scene.capture?.trigger == .automatic {
            do { try audio.prepareMicrophone() } catch { consent = false; note = "Microphone unavailable; DREAM-00 will continue without voice"; log(error.localizedDescription) }
        }
    }
    func togglePlayback() {
        if state == .idle || state == .finished { start() }
        else if state == .playing { clockPosition = scenePosition; state = .paused; player.pause(); audio.stopVoice(); audio.pause(); note = "Paused" }
        else if state == .paused {
            do {
                try audio.startEngine()
                if let original = activeCue, voicePlaybackFrame(original) < original.lengthFrames {
                    let offset = max(0, voicePlaybackFrame(original))
                    let lead = max(0, (activeProject.rate.seconds(original.startFrame) - scenePosition) / speed - activeProject.outputOffsetMs / 1000)
                    if original.repeatsSource || activeProject.rate.seconds(original.sourceInFrame + offset) < audio.takeSeconds {
                        try audio.play(original, rate: activeProject.rate, bus: activeProject.voiceLevel, delaySeconds: lead, speed: speed, offsetFrames: offset)
                    } else {
                        activeCue = nil; player.volume = Float(activeProject.filmLevel)
                        log("Voice source has finished; resumed film without restarting the take")
                    }
                }
            } catch { fail(error.localizedDescription); return }
            clockStart = ProcessInfo.processInfo.systemUptime; state = .playing; if player.currentItem != nil { player.rate = Float(speed) }; note = "Running"
        }
    }
    func voicePlaybackFrame(_ cue: VoiceCue) -> Int {
        cue.playbackFrame(sceneSeconds: scenePosition, rate: activeProject.rate, voiceAdvanceMs: activeProject.outputOffsetMs, speed: speed)
    }
    var scenePosition: Double {
        if let item = player.currentItem, item.status == .readyToPlay { return max(0, player.currentTime().seconds.isFinite ? player.currentTime().seconds - activeProject.rate.seconds(scene.mediaInFrame) : 0) }
        return clockPosition + (state == .playing || state == .recording && scene.capture?.trigger == .automatic ? (ProcessInfo.processInfo.systemUptime - clockStart) * speed : 0)
    }
    func restartScene() {
        guard state == .playing || state == .paused else { return }
        audio.stopVoice(); ledger.reset(); enterScene(selectedScene)
    }
    func nextScene() {
        guard setup == .mac, state == .playing || state == .paused else { return }
        // Rehearsal navigation still respects unresolved recording gates.
        if scene.capture?.trigger == .gate && !gateResolved.contains(selectedScene) { enterGate(); return }
        enterScene(selectedScene + 1)
    }
    func enterGate() {
        player.pause(); audio.stopVoice(); activeCue = nil; state = .gate
        frame = scene.capture?.gateFrame ?? (scene.frames - 1)
        clockPosition = activeProject.rate.seconds(frame)
        if scene.capture?.gateFrame != nil, player.currentItem != nil {
            mediaSeekReady = false
            let token = UUID(); previewToken = token
            player.seek(to: CMTime(value: Int64((frame + scene.mediaInFrame) * activeProject.rate.denominator), timescale: Int32(activeProject.rate.numerator)), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] completed in
                Task { @MainActor in
                    guard let self, self.previewToken == token else { return }
                    if completed { self.mediaSeekReady = true } else { self.fail("Recording gate frame could not be prepared") }
                }
            }
        }
        note = "Recording is optional. Ask the participant to consent or continue without voice."
        if permission == .authorized { do { try audio.prepareMicrophone() } catch { log(error.localizedDescription) } }
        log("Off-clock consent gate after \(scene.name)")
    }
    func recordAtGate() {
        guard state == .gate else { return }
        consent = true
        beginRecording(duration: scene.capture?.recordingMode == .manual ? CaptureCue.manualLimitSeconds : scene.capture?.durationSeconds ?? 6, test: false, manual: scene.capture?.recordingMode == .manual)
    }
    func declineAtGate() {
        guard state == .gate else { return }
        consent = false; audio.clearTake(); audio.releaseMicrophone(); takeSeconds = 0; gateResolved.insert(selectedScene); log("DREAM-00 selected: recording declined"); continueAfterGate()
    }
    func recordTest(manual: Bool = false) {
        guard !locked else { return }
        do { try audio.configure(input: inputUID, output: outputUID) } catch { issue = error.localizedDescription; return }
        beginRecording(duration: manual ? CaptureCue.manualLimitSeconds : 6, test: true, manual: manual)
    }
    private func beginRecording(duration: Double, test: Bool, manual: Bool = false) {
        do {
            try audio.beginCapture(seconds: duration); takeSeconds = 0; captureStarted = Date(); captureDuration = duration; captureForTest = test; captureManual = manual; recordingSeconds = 0
            state = .recording; note = test ? (manual ? "Recording test take · press Stop & Continue when finished" : "Recording your test take. It stays in memory.") : isManualRecording ? "Recording participant voice · press Stop & Continue when finished" : "Recording participant voice"; log(note)
        } catch {
            issue = error.localizedDescription; log(error.localizedDescription)
            if test { state = .idle }
            else if scene.capture?.trigger == .gate { gateResolved.insert(selectedScene); consent = false; continueAfterGate() }
            else { consent = false; state = .playing }
        }
    }
    func finishRecording() {
        guard state == .recording else { return }
        do { try audio.finishCapture(); takeSeconds = audio.takeSeconds; note = "\(String(format: "%.1f", takeSeconds)) seconds captured · ready for voice cues"; log(note) }
        catch { audio.clearTake(); takeSeconds = 0; issue = error.localizedDescription; log(error.localizedDescription) }
        audio.releaseMicrophone()
        if captureForTest { state = .idle; captureForTest = false; return }
        if scene.capture?.trigger == .gate { gateResolved.insert(selectedScene); continueAfterGate() }
        else { state = .playing }
    }
    private func continueAfterGate() {
        if scene.capture?.gateFrame != nil {
            if !mediaSeekReady { preparationStarted = ProcessInfo.processInfo.systemUptime; state = .preparing }
            else { state = .paused; togglePlayback() }
        }
        else { enterScene(selectedScene + 1) }
    }
    func audition(dry: Bool = false) {
        guard !locked, var cue = selectedVoice else { return }
        if dry { cue.bypass = true }
        do {
            try audio.configure(input: inputUID, output: outputUID)
            try audio.play(cue, rate: project.rate, bus: project.voiceLevel)
            auditioning = true; activeCue = cue; auditionStart = ProcessInfo.processInfo.systemUptime
            note = "Auditioning \(dry ? "dry" : "processed") voice · no projector playback"
        } catch { issue = error.localizedDescription }
    }
    func stop(clearMessage: Bool = true) {
        generation += 1; identifyingDisplay = false; player.pause(); audio.stopAll(); activeCue = nil; liveProject = nil; state = .idle; auditioning = false; captureForTest = false; captureManual = false; takeSeconds = 0; recordingSeconds = 0; consent = false; gateResolved = []; frame = 0; selectedScene = min(selectedScene, project.scenes.count - 1)
        if clearMessage { issue = nil; note = "Stopped. Participant recording and effect tails cleared."; log(note) }
        loadPreview()
    }
    private func finishRun() {
        player.pause(); audio.stopAll(); activeCue = nil; liveProject = nil; state = .finished; takeSeconds = 0; consent = false
        note = "Run complete. Participant voice cleared."; log(note)
    }
    func tick() {
        let now = ProcessInfo.processInfo.systemUptime
        if now - lastUIPublish >= 0.05 {
            let measured = audio.store.meter
            if abs(meter - Double(measured.rms)) > 0.001 { meter = Double(measured.rms) }
            if abs(peak - Double(measured.peak)) > 0.001 { peak = Double(measured.peak) }
            lastUIPublish = now
        }
        if let start = meterTestStart {
            meterTestPeak = max(meterTestPeak, meter)
            if Date().timeIntervalSince(start) >= 2 {
                microphonePassed = meterTestPeak > 0.001; meterTestStart = nil; audio.releaseMicrophone()
                note = microphonePassed ? "Microphone signal passed" : "No clear microphone signal. Check the input and try again."; log(note)
            }
        }
        if auditioning, let cue = activeCue {
            let localFrame = project.rate.frame(ProcessInfo.processInfo.systemUptime - auditionStart)
            audio.apply(cue, localFrame: localFrame, bus: project.voiceLevel)
            if localFrame >= cue.lengthFrames { audio.stopVoice(); activeCue = nil; auditioning = false; note = "Audition complete" }
        }
        if state == .preparing {
            if ProcessInfo.processInfo.systemUptime - preparationStarted > 10 { fail("Scene preparation timed out. Check media and output devices."); return }
            if let item = player.currentItem {
                if item.status == .failed { fail("Scene could not decode: \(scene.name)"); return }
                guard item.status == .readyToPlay && mediaSeekReady else { return }
                player.rate = Float(speed)
            }
            clockStart = ProcessInfo.processInfo.systemUptime; state = .playing; note = "Running \(scene.name)"; log(note)
        }
        if state == .recording {
            recordingSeconds = Date().timeIntervalSince(captureStarted)
            if audio.store.finished || recordingSeconds >= captureDuration + 0.1 {
                if isManualRecording { log("Manual recording reached the 10-minute memory limit") }
                finishRecording()
            }
            if captureForTest || scene.capture?.trigger == .gate { return }
        }
        guard state == .playing || state == .recording else { return }
        let p = activeProject, s = scene
        let nextFrame = min(s.frames, p.rate.frame(scenePosition))
        if frame != nextFrame { frame = nextFrame }
        if let c = s.capture, c.trigger == .gate, let gate = c.gateFrame, !gateResolved.contains(selectedScene), frame >= gate { enterGate(); return }
        if let c = s.capture, c.trigger == .automatic, !captureFired, frame >= c.startFrame {
            captureFired = true
            if consent { beginRecording(duration: c.durationSeconds, test: false) } else { log("Automatic capture skipped: no consent, DREAM-00") }
        }
        // Schedule ahead against native host time; no UI timer controls audio onset.
        let horizon = p.rate.frame(scenePosition + 0.06 * speed + max(0, p.outputOffsetMs / 1000) * speed)
        for cue in ledger.due(through: horizon, cues: s.cues) {
            let desired = (p.rate.seconds(cue.startFrame) - scenePosition) / speed - p.outputOffsetMs / 1000
            do {
                let offset = max(0, p.rate.frame(-desired * speed))
                if offset >= cue.lengthFrames { log("Voice cue missed: its region has ended; skipped without replaying late"); continue }
                try audio.play(cue, rate: p.rate, bus: p.voiceLevel, delaySeconds: max(0, desired), speed: speed, offsetFrames: offset); activeCue = cue
                if offset > 0 { log("Voice scheduling late by \(Int(-desired * 1000)) ms · resumed at region frame \(offset)") }
                log("Voice scheduled at \(p.rate.timecode(p.globalFrame(scene: selectedScene, localFrame: cue.startFrame))) · lead \(Int(desired * 1000)) ms")
            } catch { note = error.localizedDescription; log(note) }
        }
        if let cue = activeCue {
            let local = voicePlaybackFrame(cue)
            if local >= 0 { audio.apply(cue, localFrame: local, bus: p.voiceLevel) }
            player.volume = Float(p.filmLevel * p.duckLevel)
            if local >= cue.lengthFrames { audio.stopVoice(); activeCue = nil; player.volume = Float(p.filmLevel) }
        }
        if isBlack { player.volume = 0; audio.stopVoice(); activeCue = nil }
        if frame >= s.frames {
            if state == .recording { finishRecording() }
            if s.capture?.trigger == .gate && !gateResolved.contains(selectedScene) { enterGate() }
            else { enterScene(selectedScene + 1) }
        }
    }

    func openAudience() {
        identifyingDisplay = state == .idle
        if audience != nil { audience?.orderFront(nil); return }
        let target = externalScreen ?? NSScreen.main
        let onProjector = externalScreen.map { CGDisplayIsBuiltin(UInt32(Self.id($0)) ?? 0) == 0 } ?? false
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 960, height: 540), styleMask: setup == .exhibition || onProjector ? [.borderless] : [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "RE:Light — Audience"; window.isReleasedWhenClosed = false; window.backgroundColor = .black
        window.contentView = NSHostingView(rootView: AudienceView(studio: self))
        if setup == .exhibition || onProjector, let target { window.setFrame(target.frame, display: true); window.level = .floating }
        else { window.center() }
        audience = window; window.orderFront(nil)
        log("Audience output opened on \(target?.localizedName ?? "Mac display")")
    }
    var canConfirmPicture: Bool { audience?.isVisible == true && identifyingDisplay }
    func confirmPicture() {
        guard canConfirmPicture else { note = "Open audience output before confirming the picture"; return }
        projectorPassed = true; note = "Display picture confirmed"; log(note)
    }
    func closeAudience() { audience?.close(); audience = nil; projectorPassed = false; identifyingDisplay = false }
    var supportText: String {
        let checks = project.scenes.map { "\($0.name): \(mediaChecks[$0.id]?.detail ?? "Not checked")" }.joined(separator: "\n")
        let eventsText = events.prefix(35).map { "\($0.time.formatted(date: .omitted, time: .standard))  \($0.text)" }.joined(separator: "\n")
        return """
        RE:Light Native \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "development")
        Project: \(project.title)
        Setup: \(setup.rawValue)   State: \(state.rawValue)   Frame: \(timecode)
        Visitor recording: \(takeSeconds > 0 ? "temporary, in memory" : "none")
        Microphone test: \(microphonePassed ? "passed" : "not tested")
        Speakers: \(speakersPassed ? "confirmed" : "not confirmed")
        Picture: \(projectorPassed ? "confirmed" : "not confirmed")
        USB access: \(hardware.access)
        AC power: \(Self.onACPower ? "connected" : "not connected")

        PROJECT CHECKS
        \(blockers.isEmpty ? "Project can rehearse with current setup" : blockers.joined(separator: "\n"))

        MEDIA
        \(checks)

        RECENT EVENTS
        \(eventsText)

        SHORTCUTS
        ⌘Return  Start / Pause / Resume     ⌘.  Stop & Clear
        ⌘S  Save     ⌘Z  Undo     ⌘⇧Z  Redo

        RECOVERY
        Missing microphone: choose the intended input in Devices and Test signal.
        Denied microphone access: enable RE:Light in System Settings → Privacy & Security → Microphone.
        Missing exhibition kit: Continue with this Mac starts rehearsal using local devices.
        Failed film: choose the scene in Edit, replace its film; media checks update automatically.
        Stop & Clear stops playback, cancels effect tails, and deletes the temporary voice.

        Physical projector framing, speaker latency, room levels, external microphones, and USB controls require tests with the connected exhibition kit. Mac rehearsal does not certify the installation.
        Support reports contain no recorded audio or transcript.
        """
    }

    func exportDiagnostics() {
        let panel = NSSavePanel(); panel.nameFieldStringValue = "RELight-support.txt"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let text = supportText
        do { try text.write(to: url, atomically: true, encoding: .utf8); note = "Support report saved locally. No audio included." } catch { issue = error.localizedDescription }
    }
    func shutdown() { audio.stopAll(); player.pause(); hardware.shutdown(); timer?.invalidate(); topologyTimer?.invalidate() }
}
