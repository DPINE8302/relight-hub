import AppKit
import AVFoundation
import Combine
import SwiftUI
import IOKit.ps
import RELightCore
import UniformTypeIdentifiers

enum RunState: String { case idle = "Ready", preparing = "Preparing", playing = "Running", paused = "Paused", gate = "Ready to record", countdown = "Starting recording", recording = "Recording", finished = "Complete" }
enum Workspace: String, CaseIterable { case run = "Run", edit = "Edit" }
enum SetupKind: String, CaseIterable { case mac = "This Mac", exhibition = "Exhibition" }
struct StudioEvent: Identifiable { let id = UUID(); let time = Date(); let text: String }
struct MediaCheck { let valid: Bool; let detail: String }
private struct MediaIdentity: Equatable {
    let id: UUID; let media: String?; let frames: Int; let source: Int
    init(_ scene: RELightCore.Scene) { id = scene.id; media = scene.media; frames = scene.frames; source = scene.mediaInFrame }
}

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
    @Published var issue: String?
    private var includedExperienceError: String?
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
    @Published private(set) var importingMedia = false
    @Published private(set) var exportingProject = false
    private var importGeneration = UUID()
    @Published var auditioning = false
    @Published private(set) var previewingFilm = false
    private var previewReachedEnd = false
    private var seekInProgress = false
    private var seekToken = UUID()
    @Published var identifyingDisplay = false
    @Published var countdownRemaining = 0
    @Published var narratorMuted = false {
        didSet { narratorPlayer?.volume = narratorMuted ? 0 : 1 }
    }
    @Published var previewingNarrator = false
    private var narratorPlayer: AVAudioPlayer?
    private var countdownDeadline: Double?
    private var narratorStarted: Double?
    private var narratorDuration: Double = 0
    private var mediaValidationToken = UUID()
    private var validationTask: Task<Void, Never>?
    @Published private(set) var refreshingDevices = false
    @Published private(set) var hasDeviceInventory = false
    private var deviceRefreshTask: Task<Void, Never>?
    private let preferences: UserDefaults
    private let ephemeralPreferenceDomain: String?
    private var previousInputUID = "", previousOutputUID = "", previousScreenID = ""
    @Published var permission = AVCaptureDevice.authorizationStatus(for: .audio)
    let player = AVPlayer()
    let audio = NativeAudio()
    let hardware = Hardware()
    private(set) var root: URL
    private var file: URL
    private var liveProject: Project?
    private var liveInputUID: String?
    private var liveOutputUID: String?
    private var captureRouteInterrupted = false
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

    var locked: Bool { ![.idle, .finished].contains(state) || auditioning || importingMedia }
    var activeProject: Project { liveProject ?? project }
    var scene: RELightCore.Scene { activeProject.scenes[min(max(0, selectedScene), activeProject.scenes.count - 1)] }
    var globalFrame: Int { activeProject.globalFrame(scene: selectedScene, localFrame: frame) }
    var timecode: String { activeProject.rate.timecode((activeProject.timecodeStartFrame ?? 0) + globalFrame) }
    var canSeek: Bool { !importingMedia && !auditioning && [.idle, .finished, .playing, .paused].contains(state) }
    var requiresUSB: Bool { project.requiresPhysicalControls ?? true }
    var filmEndTimecode: String { project.rate.timecode((project.timecodeStartFrame ?? 0) + project.totalFrames) }
    var isBlack: Bool { state == .gate || state == .countdown || (state == .recording && !captureForTest && scene.capture?.trigger == .gate) || (activeProject.blackFromFrame.map { globalFrame >= $0 } ?? false) }
    var hasVideo: Bool { scene.media != nil && mediaChecks[scene.id]?.valid == true }
    var selectedVoice: VoiceCue? { project.scenes[selectedScene].cues.first { $0.id == selectedCue } }
    var missingFilms: Int { project.scenes.filter { $0.media == nil || mediaChecks[$0.id]?.valid != true }.count }
    var externalScreen: NSScreen? { screens.first { Self.id($0) == screenID } }
    var playbackOutputUID: String { liveProject != nil && !previewingFilm ? (liveOutputUID ?? outputUID) : outputUID }
    var captureInputUID: String { liveProject != nil && !previewingFilm ? (liveInputUID ?? inputUID) : inputUID }
    var configuredInputMissing: Bool { hasDeviceInventory && !inputUID.isEmpty && !devices.contains { $0.uid == inputUID && $0.input } }
    var configuredOutputMissing: Bool { hasDeviceInventory && !outputUID.isEmpty && !devices.contains { $0.uid == outputUID && $0.output } }
    var blockers: [String] {
        var result = project.validation()
        if let includedExperienceError { result.append(includedExperienceError) }
        if project.scenes.contains(where: { $0.media != nil && mediaChecks[$0.id] == nil }) { result.append("Checking scene films. Please wait.") }
        if !hasDeviceInventory { result.append(refreshingDevices ? "Checking connected audio devices…" : "Audio devices could not be checked. Refresh devices before starting.") }
        if configuredInputMissing && project.scenes.contains(where: { $0.capture != nil }) { result.append("The saved microphone is disconnected. Choose a device or Continue with this Mac.") }
        if configuredOutputMissing { result.append("The saved speakers are disconnected. Choose a device or Continue with this Mac.") }
        if setup == .exhibition {
            if missingFilms > 0 { result.append("\(missingFilms) scenes need valid film") }
            if project.scenes.contains(where: { $0.draft }) { result.append("Approve final media for every scene in Edit") }
            if externalScreen == nil || CGDisplayIsBuiltin(UInt32(screenID) ?? 0) != 0 { result.append("Select an external projector display") }
            if !projectorPassed { result.append("Confirm the picture on the projector") }
            if !speakersPassed { result.append("Test and confirm the intended speakers") }
            if project.scenes.contains(where: { $0.capture != nil }) && !microphonePassed { result.append("Test the selected microphone") }
            if requiresUSB {
                for role in ["RECORD_BUTTON", "CHOICE_BUTTON"] where !hardware.connected(role) || !hardware.tested.contains(role) { result.append("Assign and test \(role == "RECORD_BUTTON" ? "Record" : "Skip recording") control") }
            }
            if !Self.onACPower { result.append("Connect the Mac to power") }
        }
        return result
    }
    static func id(_ screen: NSScreen) -> String { String((screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0) }
    static var onACPower: Bool {
        guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(), let source = IOPSGetProvidingPowerSourceType(info)?.takeRetainedValue() else { return false }
        return source as String == kIOPSACPowerValue
    }

    init(storageRoot: URL? = nil, startHardware: Bool = true, preferences suppliedPreferences: UserDefaults? = nil, scanDevices: Bool = true) {
        let isolatedDomain = storageRoot != nil && suppliedPreferences == nil ? "RELightNative-Test-" + UUID().uuidString : nil
        ephemeralPreferenceDomain = isolatedDomain
        self.preferences = suppliedPreferences ?? isolatedDomain.flatMap { UserDefaults(suiteName: $0) } ?? .standard
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(Bundle.main.bundleIdentifier?.hasSuffix(".review") == true ? "RELight Native Verification" : "RELight Native")
        root = storageRoot ?? support.appendingPathComponent("Starter Project"); file = root.appendingPathComponent("experience.relight")
        try? FileManager.default.createDirectory(at: root.appendingPathComponent("media"), withIntermediateDirectories: true)
        let bundled = Bundle.main.resourceURL?.appendingPathComponent("media/Scene01_Draft1_480p_v5.mp4")
        if let bundled, FileManager.default.fileExists(atPath: bundled.path), !FileManager.default.fileExists(atPath: root.appendingPathComponent("media/Scene01_Draft1_480p_v5.mp4").path) { try? FileManager.default.copyItem(at: bundled, to: root.appendingPathComponent("media/Scene01_Draft1_480p_v5.mp4")) }
        if storageRoot == nil {
            if let resources = Bundle.main.resourceURL, Bundle.main.object(forInfoDictionaryKey: "RELightIncludedExperienceRequired") as? Bool == true || FileManager.default.fileExists(atPath: resources.appendingPathComponent("Included Experience/manifest.json").path) {
                do {
                    guard let experience = try BundledExperience.read(resources: resources) else { throw AudioFailure("The included film manifest is missing. Download the complete app again.") }
                    file = try experience.initialProject(support: support, resources: resources, preferences: preferences)
                    root = file.deletingLastPathComponent()
                } catch { includedExperienceError = "Could not prepare the included film: \(error.localizedDescription)"; issue = includedExperienceError }
            } else if let remembered = preferences.string(forKey: "native.project"), FileManager.default.fileExists(atPath: remembered) {
                file = URL(fileURLWithPath: remembered); root = file.deletingLastPathComponent()
            } else {
                do {
                    root = try Self.prepareDraftExample(support: support)
                    file = root.appendingPathComponent("experience.relight")
                } catch { issue = "Could not prepare bundled draft: \(error.localizedDescription)" }
            }
        }
        if let data = try? Data(contentsOf: file), let p = try? JSONDecoder().decode(Project.self, from: data), p.validation().isEmpty { project = p }
        narratorMuted = scene.capture?.narratorMuted == true
        setup = SetupKind(rawValue: preferences.string(forKey: "native.setup") ?? "") ?? .mac
        let routePrefix = setup == .exhibition ? "native." : "native.mac."
        inputUID = preferences.string(forKey: routePrefix + "input") ?? ""
        outputUID = preferences.string(forKey: routePrefix + "output") ?? ""
        screenID = preferences.string(forKey: routePrefix + "screen") ?? ""
        previousInputUID = inputUID; previousOutputUID = outputUID; previousScreenID = screenID
        if !FileManager.default.fileExists(atPath: file.path), let data = try? JSONEncoder().encode(project) { try? data.write(to: file, options: .atomic) }
        if scanDevices { refreshDevices() }
        if startHardware { hardware.start() }
        hardware.onInput = { [weak self] role in
            guard let self else { return }
            if role == "RECORD_BUTTON", self.state == .gate { self.recordAtGate() }
            else if role == "RECORD_BUTTON", self.state == .recording, Date().timeIntervalSince(self.captureStarted) >= 0.2 { self.finishRecording() }
            else if role == "CHOICE_BUTTON", [.gate, .countdown].contains(self.state) { self.declineAtGate() }
        }
        hardware.onDisconnect = { [weak self] in
            guard let self, self.locked else { return }
            if self.requiresUSB && (self.setup == .exhibition || (!self.hardware.bindings.isEmpty && [.gate, .countdown, .recording].contains(self.state))) {
                self.fail("An assigned USB control disconnected. Reconnect it and test before restarting.")
            }
        }
        hardwareSubscription = hardware.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        timer = Timer.scheduledTimer(withTimeInterval: 0.01, repeats: true) { [weak self] _ in Task { @MainActor in self?.tick() } }
        if scanDevices { topologyTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in Task { @MainActor in self?.refreshDevices() } } }
        playerObservation = player.observe(\.status) { [weak self] player, _ in
            if player.status == .failed { Task { @MainActor in self?.fail("Video playback failed. Validate the scene media before restarting.") } }
        }
        refreshMediaAfterEdit()
        if issue == nil { note = "\(project.title) ready. Press Start Exhibition to play." }
        log("Native workspace opened. Participant audio is never saved.")
    }
    func log(_ text: String) { events.insert(StudioEvent(text: text), at: 0); if events.count > 100 { events.removeLast() } }
    func fail(_ text: String) { stop(clearMessage: false); issue = text; note = text; log(text) }
    func refreshDevices() {
        guard deviceRefreshTask == nil else { return }
        refreshingDevices = true
        deviceRefreshTask = Task { [weak self] in
            let result = await Task.detached(priority: .utility) { () -> ([SoundDevice]?, String?) in
                do { return (try DeviceCatalog.discover(), nil) } catch { return (nil, error.localizedDescription) }
            }.value
            guard !Task.isCancelled, let self else { return }
            if let discovered = result.0 { self.applyDeviceInventory(discovered, screens: NSScreen.screens) }
            else if let error = result.1 { self.note = error }
            self.refreshingDevices = false; self.deviceRefreshTask = nil
        }
    }
    func applyDeviceInventory(_ discovered: [SoundDevice], screens newScreens: [NSScreen]) {
        let checkedInput = captureInputUID, checkedOutput = playbackOutputUID
        let previousInput = checkedInput.isEmpty ? devices.first(where: \.systemInput)?.uid : devices.first(where: { $0.uid == checkedInput && $0.input })?.uid
        let currentInput = checkedInput.isEmpty ? discovered.first(where: \.systemInput)?.uid : discovered.first(where: { $0.uid == checkedInput && $0.input })?.uid
        let previousOutput = checkedOutput.isEmpty ? devices.first(where: \.systemOutput)?.uid : devices.first(where: { $0.uid == checkedOutput && $0.output })?.uid
        let currentOutput = checkedOutput.isEmpty ? discovered.first(where: \.systemOutput)?.uid : discovered.first(where: { $0.uid == checkedOutput && $0.output })?.uid
        let inputLost = previousInput != nil && previousInput != currentInput
        let outputLost = previousOutput != nil && previousOutput != currentOutput
        let screenLost = screens.contains { Self.id($0) == screenID } && !newScreens.contains { Self.id($0) == screenID }
        devices = discovered; screens = newScreens; hasDeviceInventory = true
        permission = AVCaptureDevice.authorizationStatus(for: .audio)
        if inputLost {
            microphonePassed = false
            if locked && !previewingFilm { captureRouteInterrupted = true; consent = false }
            if meterTestStart != nil { meterTestStart = nil; meterTestPeak = 0; audio.releaseMicrophone(); note = "Microphone changed or disconnected during the signal test. Choose the intended input and test again." }
        }
        if outputLost { speakersPassed = false; tonePlayed = false }
        if screenLost { projectorPassed = false; audience?.close(); audience = nil }
        if outputLost && previewingNarrator { stopNarrator(); issue = "Narrator speakers changed or disconnected. Choose and test the intended output." }
        if locked && (outputLost || (screenLost && setup == .exhibition && !previewingFilm)) {
            if previewingFilm { stopFilmPreview(); issue = "The selected output disconnected. Preview stopped at the playhead; choose a connected output in Devices." }
            else { fail(screenLost ? (outputLost ? "Projector and selected speakers disconnected. Reconnect and test both before restarting." : "The selected projector disconnected. Reconnect it and confirm the picture before restarting.") : "The selected speakers changed or disconnected. Reconnect and test the intended output before restarting.") }
        } else if inputLost && state == .recording {
            audio.clearTake(); audio.releaseMicrophone(); takeSeconds = 0; consent = false
            if captureForTest { state = .idle; captureForTest = false; captureManual = false }
            else if scene.capture?.trigger == .gate { gateResolved.insert(selectedScene); continueAfterGate() }
            else { state = .playing }
            issue = "Microphone disconnected during capture. Recording was discarded; the film continues without visitor voice."
        } else if inputLost && !previewingFilm {
            log("Selected microphone disconnected. Choose a connected input before the next recording.")
        }
        hardware.active(NSApplication.shared.isActive || locked)
    }
    private func rememberSelectedRoutes() {
        preferences.set(setup.rawValue, forKey: "native.setup")
        let prefix = setup == .exhibition ? "native." : "native.mac."
        preferences.set(inputUID, forKey: prefix + "input"); preferences.set(outputUID, forKey: prefix + "output"); preferences.set(screenID, forKey: prefix + "screen")
        previousInputUID = inputUID; previousOutputUID = outputUID; previousScreenID = screenID
    }
    func continueWithMac() {
        guard !locked else { return }
        meterTestStart = nil; meterTestPeak = 0; stopNarrator()
        closeAudience(); setup = .mac
        inputUID = devices.first { $0.input && $0.uid.lowercased().contains("builtin") }?.uid ?? devices.first { $0.input && $0.name.contains("MacBook") }?.uid ?? ""
        outputUID = devices.first { $0.output && $0.uid.lowercased().contains("builtin") }?.uid ?? ""
        screenID = NSScreen.main.map(Self.id) ?? ""
        // Local substitutes do not overwrite the saved exhibition kit.
        microphonePassed = false; speakersPassed = false; projectorPassed = false; tonePlayed = false; issue = nil
        note = "Using this Mac. Your project and saved exhibition assignments are unchanged."
        audio.stopAll(); rememberSelectedRoutes(); log(note)
    }
    func chooseExhibition() {
        guard !locked else { return }
        meterTestStart = nil; meterTestPeak = 0; stopNarrator()
        closeAudience(); setup = .exhibition; speed = 1
        inputUID = preferences.string(forKey: "native.input") ?? ""
        outputUID = preferences.string(forKey: "native.output") ?? ""
        screenID = preferences.string(forKey: "native.screen") ?? ""
        microphonePassed = false; speakersPassed = false; projectorPassed = false; tonePlayed = false; hardware.tested.removeAll(); audio.stopAll()
        rememberSelectedRoutes()
    }
    func deviceChanged() {
        guard !locked else { return }
        let inputChanged = inputUID != previousInputUID, outputChanged = outputUID != previousOutputUID, screenChanged = screenID != previousScreenID
        if inputChanged { microphonePassed = false; meterTestStart = nil }
        if outputChanged { speakersPassed = false; tonePlayed = false }
        if inputChanged || outputChanged { meterTestStart = nil; meterTestPeak = 0; stopNarrator(); audio.stopVoice(); audio.releaseMicrophone(); audio.pause() }
        if screenChanged { closeAudience() }
        rememberSelectedRoutes()
        player.audioOutputDeviceUniqueID = playbackOutputUID.isEmpty ? nil : playbackOutputUID
        issue = nil
    }
    func allowMicrophone() {
        permission = AVCaptureDevice.authorizationStatus(for: .audio)
        note = "Waiting for macOS microphone permission…"
        AVCaptureDevice.requestAccess(for: .audio) { [weak self] allowed in Task { @MainActor in self?.permission = AVCaptureDevice.authorizationStatus(for: .audio); self?.note = allowed ? "Microphone access allowed. Test your input." : "Microphone access denied. Open System Settings → Privacy & Security → Microphone." } }
    }
    func microphoneSettings() { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")!) }
    private func configureAudio(requireInput: Bool = true, preserveTake: Bool = false) throws {
        let routedInput = captureInputUID, routedOutput = playbackOutputUID
        if !hasDeviceInventory && audio.hasConfiguration && routedOutput == audio.configuredOutputUID && (!requireInput || routedInput == audio.configuredInputUID) { return }
        guard hasDeviceInventory else { throw AudioFailure("Wait for device discovery, then select a connected device in Devices.") }
        try audio.configure(input: routedInput, output: routedOutput, inventory: devices, validateInput: requireInput, preserveTake: preserveTake)
        if liveProject != nil && !previewingFilm { liveInputUID = audio.configuredInputUID; liveOutputUID = audio.configuredOutputUID }
    }
    func testMicrophone() {
        guard !locked else { return }
        do {
            try configureAudio(preserveTake: true); try audio.prepareMicrophone()
            beginMicrophoneSignalObservation(); note = "Speak normally for two seconds."
        } catch { issue = error.localizedDescription }
    }
    func beginMicrophoneSignalObservation(now: Date = Date()) { meterTestPeak = 0; meterTestStart = now }
    func advanceMicrophoneSignalObservation(now: Date = Date()) {
        guard let start = meterTestStart else { return }
        meterTestPeak = max(meterTestPeak, Double(audio.store.meter.rms))
        if now.timeIntervalSince(start) >= 2 {
            microphonePassed = meterTestPeak > 0.001 && !configuredInputMissing
            meterTestStart = nil; audio.releaseMicrophone()
            note = microphonePassed ? "Microphone signal passed" : "No clear microphone signal. Check the input and try again."; log(note)
        }
    }
    func testSpeakers() {
        guard !locked else { return }
        do { try configureAudio(requireInput: false, preserveTake: true); try audio.testTone(); tonePlayed = true; note = "Did you hear the tone through the intended speakers?" } catch { issue = error.localizedDescription }
    }
    func confirmSpeakers() { guard tonePlayed else { return }; speakersPassed = true; note = "Speaker test confirmed"; log(note) }

    func mutate(_ change: (inout Project) -> Void) {
        guard !locked else { return }
        var changed = project
        change(&changed)
        guard changed != project else { return }
        undoHistory.append(project); if undoHistory.count > 100 { undoHistory.removeFirst() }; redoHistory = []
        let mediaChanged = changed.rate != project.rate || changed.scenes.map(MediaIdentity.init) != project.scenes.map(MediaIdentity.init)
        if changed.scenes[selectedScene].capture?.narrator != project.scenes[selectedScene].capture?.narrator { stopNarrator() }
        project = changed; dirty = true; issue = nil
        narratorMuted = scene.capture?.narratorMuted == true
        if mediaChanged { refreshMediaAfterEdit() }
    }
    func mutateCue(_ change: (inout VoiceCue) -> Void) {
        guard let id = selectedCue, let i = project.scenes[selectedScene].cues.firstIndex(where: { $0.id == id }) else { return }
        mutate { change(&$0.scenes[selectedScene].cues[i]) }
    }
    func undo() { guard !locked, let p = undoHistory.popLast() else { return }; stopNarrator(); redoHistory.append(project); project = p; dirty = true; refreshMediaAfterEdit() }
    func redo() { guard !locked, let p = redoHistory.popLast() else { return }; stopNarrator(); undoHistory.append(project); project = p; dirty = true; refreshMediaAfterEdit() }
    private func refreshMediaAfterEdit() {
        mediaValidationToken = UUID()
        mediaChecks = [:]; player.pause(); player.replaceCurrentItem(with: nil)
        frame = min(frame, scene.frames - 1)
        validationTask?.cancel()
        let token = mediaValidationToken
        validationTask = Task { await performMediaValidation(token: token) }
    }
    func addCue() {
        let cue = VoiceCue(startFrame: min(frame, max(0, scene.frames - 144)), lengthFrames: min(144, scene.frames))
        mutate { $0.scenes[selectedScene].cues.append(cue) }; selectedCue = cue.id
    }
    func removeCue() { guard let id = selectedCue else { return }; mutate { $0.scenes[selectedScene].cues.removeAll { $0.id == id } }; selectedCue = nil }
    func selectScene(_ index: Int) {
        if previewingFilm { stopFilmPreview() }
        guard !locked, project.scenes.indices.contains(index) else { return }
        stopNarrator(); selectedScene = index; selectedCue = project.scenes[index].cues.first?.id; frame = 0; loadPreview()
    }
    func seek(_ value: Int) {
        guard canSeek else { return }
        previewReachedEnd = false
        frame = max(0, min(scene.frames - 1, value)); audio.stopVoice(); activeCue = nil
        player.volume = Float(activeProject.filmLevel)
        ledger.reset()
        ledger.skip(through: frame, cues: scene.cues.filter { $0.startFrame + $0.lengthFrames <= frame })
        clockPosition = activeProject.rate.seconds(frame); clockStart = ProcessInfo.processInfo.systemUptime
        guard player.currentItem != nil else { return }
        let token = UUID(); seekToken = token; seekInProgress = true
        player.seek(to: CMTime(value: Int64((frame + scene.mediaInFrame) * activeProject.rate.denominator), timescale: Int32(activeProject.rate.numerator)), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] completed in
            Task { @MainActor in
                guard let self, self.seekToken == token else { return }
                self.seekInProgress = false; self.clockStart = ProcessInfo.processInfo.systemUptime
                if !completed { self.issue = "Film seek was interrupted. Choose a position again." }
            }
        }
    }
    func stepFrames(_ delta: Int) { guard canSeek else { return }; seek(frame + delta) }
    func jumpToRecording() { seek(scene.capture?.gateFrame ?? max(0, scene.frames - 1)) }
    func jumpToDream() { if let cue = scene.cues.first { seek(cue.startFrame) } }
    func jumpToTimecode(_ text: String) -> Bool {
        let parts = text.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: ":", omittingEmptySubsequences: false)
        let values = parts.compactMap { Int($0) }
        let nominal = max(1, Int(project.rate.fps.rounded()))
        guard canSeek, values.count == 4, values[0] >= 0, values[0] <= 99, (0..<60).contains(values[1]), (0..<60).contains(values[2]), (0..<nominal).contains(values[3]) else { issue = "Enter a film timecode as HH:MM:SS:FF."; return false }
        let sourceFrame = ((values[0] * 60 + values[1]) * 60 + values[2]) * nominal + values[3]
        let local = sourceFrame - (project.timecodeStartFrame ?? 0) - project.globalFrame(scene: selectedScene, localFrame: 0)
        guard (0..<scene.frames).contains(local) else { issue = "That timecode is outside the selected film."; return false }
        issue = nil; seek(local); return true
    }
    func toggleFilmPreview() {
        if previewingFilm {
            if state == .paused && previewReachedEnd { seek(0) }
            togglePlayback(); return
        }
        guard !locked else { return }
        guard hasVideo else { issue = "Choose a valid film before previewing."; return }
        seekToken = UUID(); seekInProgress = false
        meterTestStart = nil; stopNarrator(); audio.releaseMicrophone()
        if audio.take != nil {
            do { try configureAudio(requireInput: false, preserveTake: true) } catch { issue = error.localizedDescription; return }
        }
        liveProject = nil; liveInputUID = nil; liveOutputUID = nil
        player.audioOutputDeviceUniqueID = outputUID.isEmpty ? nil : outputUID
        previewingFilm = true; identifyingDisplay = false; activeCue = nil; issue = nil
        if previewReachedEnd { frame = 0 }
        previewReachedEnd = false
        ledger.reset(); ledger.skip(through: frame, cues: scene.cues.filter { $0.startFrame + $0.lengthFrames <= frame })
        clockPosition = project.rate.seconds(frame); preparationStarted = ProcessInfo.processInfo.systemUptime
        state = .preparing; mediaSeekReady = false
        let token = UUID(); previewToken = token
        player.seek(to: CMTime(seconds: project.rate.seconds(scene.mediaInFrame + frame), preferredTimescale: 60000), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] completed in
            Task { @MainActor in
                guard let self, self.previewToken == token, self.previewingFilm else { return }
                if completed { self.mediaSeekReady = true } else { self.stopFilmPreview(); self.issue = "Film preview could not seek to the playhead." }
            }
        }
        note = "Preview from playhead. Recording screens are skipped; Start Exhibition runs the full sequence."
    }
    func stopFilmPreview() {
        guard previewingFilm else { return }
        player.pause(); audio.stopVoice(); audio.pause(); activeCue = nil; previewingFilm = false
        previewToken = UUID(); seekToken = UUID(); seekInProgress = false
        state = .idle; note = "Preview stopped at the playhead."
    }
    func loadPreview() {
        seekToken = UUID(); seekInProgress = false; previewReachedEnd = false
        player.pause(); player.replaceCurrentItem(with: nil)
        if let path = scene.media, let url = project.assetURL(path, root: root), mediaChecks[scene.id]?.valid == true {
            player.replaceCurrentItem(with: AVPlayerItem(url: url))
            player.seek(to: CMTime(seconds: project.rate.seconds(scene.mediaInFrame + frame), preferredTimescale: 60000), toleranceBefore: .zero, toleranceAfter: .zero)
        }
        player.audioOutputDeviceUniqueID = playbackOutputUID.isEmpty ? nil : playbackOutputUID; player.volume = Float(project.filmLevel)
    }
    func validateMedia() async {
        validationTask?.cancel()
        let token = UUID(); mediaValidationToken = token
        await performMediaValidation(token: token)
    }
    private func performMediaValidation(token: UUID) async {
        guard !Task.isCancelled, mediaValidationToken == token else { return }
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
                guard duration.seconds.isFinite, duration.seconds > 0, rate.isFinite, rate > 0 else { throw AudioFailure("Video duration or frame rate is unavailable") }
                let lengthMatch = duration.seconds * checkedProject.rate.fps + 0.01 >= Double(s.mediaInFrame + s.frames)
                let rateMatch = abs(Double(rate) - checkedProject.rate.fps) < 0.05
                let valid = lengthMatch && rateMatch
                checks[s.id] = MediaCheck(valid: valid, detail: valid ? "\(s.frames) frames from source \(s.mediaInFrame) · \(rate) fps · playable" : "Needs source frames \(s.mediaInFrame)–\(s.mediaInFrame + s.frames) at \(checkedProject.rate.fps) fps; found \(Int((duration.seconds * Double(rate)).rounded())) frames at \(rate) fps")
            } catch { checks[s.id] = MediaCheck(valid: false, detail: error.localizedDescription) }
        }
        guard !Task.isCancelled, mediaValidationToken == token, project.rate == checkedProject.rate, project.scenes.map(MediaIdentity.init) == checkedProject.scenes.map(MediaIdentity.init), root == checkedRoot else { return }
        mediaChecks = checks
        if !locked { loadPreview() }
    }
    static func assetName(_ path: String) -> String {
        let name = URL(fileURLWithPath: path).lastPathComponent
        if name.count > 37, UUID(uuidString: String(name.prefix(36))) != nil, name.dropFirst(36).first == "-" { return String(name.dropFirst(37)) }
        return name
    }
    func importMedia() {
        guard !locked else { return }
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.movie]; panel.message = "Choose a scene film. Its source starts at frame zero; scene timing and voice cues are retained."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        Task { do { try await importMovie(from: url, fitScene: false) } catch is CancellationError {} catch { issue = error.localizedDescription } }
    }
    func replaceFullFilm() {
        guard !locked else { return }
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.movie]
        panel.message = "Replace the film with your new export. Its full length is used; recording and dream cue frames stay unchanged."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        Task { do { try await importMovie(from: url, fitScene: true) } catch is CancellationError {} catch { issue = error.localizedDescription } }
    }
    func cancelMediaImport() { importGeneration = UUID(); importingMedia = false; note = "Import cancelled. The previous film and cue timing are unchanged." }
    func importMovie(from url: URL, fitScene: Bool) async throws {
        guard !locked else { throw AudioFailure("Stop playback before replacing media.") }
        let token = UUID(); importGeneration = token; importingMedia = true
        let original = project, originalRoot = root, index = selectedScene
        let relative = "media/" + UUID().uuidString + "-" + url.lastPathComponent
        guard let destination = original.assetURL(relative, root: originalRoot) else { importingMedia = false; throw AudioFailure("Unsafe media destination") }
        var committed = false
        defer {
            if importGeneration == token { importingMedia = false }
            if !committed { try? FileManager.default.removeItem(at: destination) }
        }
        do {
        note = "Importing film… the original project is preserved until the copy finishes."
        var changed = original
        if fitScene {
            let asset = AVURLAsset(url: url)
            let tracks = try await asset.loadTracks(withMediaType: .video)
            guard let track = tracks.first, try await asset.load(.isPlayable) else { throw AudioFailure("Choose a playable movie with a video track.") }
            let range = try await track.load(.timeRange), nominal = try await track.load(.nominalFrameRate)
            let end = CMTimeRangeGetEnd(range).seconds
            guard end.isFinite, end > 0, end * original.rate.fps <= 1_000_000, abs(Double(nominal) - original.rate.fps) < 0.05 else { throw AudioFailure("Export the film at \(original.rate.fps) fps with a supported duration.") }
            changed.scenes[index].frames = max(1, original.rate.frame(end))
            if let black = changed.blackFromFrame { changed.blackFromFrame = max(0, changed.totalFrames - (original.totalFrames - black)) }
        }
        changed.scenes[index].media = relative; changed.scenes[index].mediaInFrame = 0; changed.scenes[index].draft = true
        let errors = changed.validation()
        guard errors.isEmpty else { throw AudioFailure("This export cannot keep the current cue timing: " + errors.joined(separator: "; ")) }
        guard importGeneration == token else { throw CancellationError() }
        try await Task.detached(priority: .userInitiated) {
            try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: url, to: destination)
        }.value
        guard !Task.isCancelled, importGeneration == token, project == original, root == originalRoot, selectedScene == index else { throw CancellationError() }
        importingMedia = false; mutate { $0 = changed }; committed = true
        note = fitScene ? "New film imported at full length. Recording and dream cue frames retained; review and approve the new export." : "Film imported. Scene timing and voice cues retained."
        } catch {
            if importGeneration != token || Task.isCancelled { throw CancellationError() }
            throw error
        }
    }
    func importMedia(from url: URL) throws {
        guard !locked else { return }
        let relative = try copyAsset(url)
        mutate { $0.scenes[selectedScene].media = relative; $0.scenes[selectedScene].mediaInFrame = 0; $0.scenes[selectedScene].draft = true }
        note = "Film imported. Scene timing retained; use full clip or adjust source and length."
    }
    private func copyAsset(_ url: URL) throws -> String {
        let relative = "media/" + UUID().uuidString + "-" + url.lastPathComponent
        guard let destination = project.assetURL(relative, root: root) else { throw AudioFailure("Unsafe media destination") }
        try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: url, to: destination)
        return relative
    }
    func useFullClip() async {
        guard !locked, let path = scene.media, let url = project.assetURL(path, root: root) else { return }
        let id = scene.id, originalProject = project
        do {
            let tracks = try await AVURLAsset(url: url).loadTracks(withMediaType: .video)
            guard let track = tracks.first else { throw AudioFailure("No video track is available") }
            let videoRange = try await track.load(.timeRange)
            let duration = CMTimeRangeGetEnd(videoRange).seconds
            guard !locked, scene.id == id, project == originalProject else { return }
            guard duration.isFinite, duration > 0, duration * project.rate.fps <= 1_000_000 else { throw AudioFailure("Unsupported clip duration") }
            let frames = max(1, project.rate.frame(duration))
            guard scene.cues.allSatisfy({ $0.startFrame + $0.lengthFrames <= frames }), scene.capture?.gateFrame.map({ $0 < frames }) ?? true else { throw AudioFailure("Move or shorten voice cues and the recording screen before fitting this shorter film.") }
            let oldTotal = project.totalFrames, oldLength = scene.frames
            var fitted = project
            fitted.scenes[selectedScene].frames = frames; fitted.scenes[selectedScene].mediaInFrame = 0
            if let black = fitted.blackFromFrame { fitted.blackFromFrame = max(0, fitted.totalFrames - (oldTotal - black)) }
            let errors = fitted.validation()
            guard errors.isEmpty else { throw AudioFailure(errors.joined(separator: "\n")) }
            mutate { $0 = fitted }
            note = "Scene fitted to \(frames) frames (was \(oldLength)). Voice cue timing retained."
        } catch { issue = error.localizedDescription }
    }
    static let defaultNarratorFile = "RELight-Ainsley-Thai-Countdown.mp3"
    func setRecordingStartMethod(_ method: CaptureCue.StartMethod) {
        guard !locked, scene.capture != nil else { return }
        if method == .narrator && scene.capture?.narrator == nil { useBundledNarrator(); return }
        mutate { $0.scenes[selectedScene].capture?.startMethod = method }
    }
    func setNarratorMuted(_ value: Bool) {
        if locked {
            var changed = project
            changed.scenes[selectedScene].capture?.narratorMuted = value
            if changed != project {
                undoHistory.append(project); if undoHistory.count > 100 { undoHistory.removeFirst() }
                redoHistory = []; project = changed; dirty = true
            }
            liveProject?.scenes[selectedScene].capture?.narratorMuted = value
            narratorMuted = value
        } else { mutate { $0.scenes[selectedScene].capture?.narratorMuted = value } }
    }
    func useBundledNarrator(resources: URL? = Bundle.main.resourceURL) {
        guard !locked, scene.capture != nil else { return }
        guard let source = resources?.appendingPathComponent("Narration/" + Self.defaultNarratorFile), FileManager.default.fileExists(atPath: source.path) else {
            issue = "The bundled Ainsley narrator is unavailable. Choose narrator audio to use another file."
            return
        }
        do { try importNarrator(from: source); note = "Ainsley narrator selected. Preview it or mute it for this scene." }
        catch { issue = error.localizedDescription }
    }
    func chooseNarrator() {
        guard !locked else { return }
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.audio]; panel.message = "Choose narrator audio. Recording begins after the complete clip, including its spoken countdown."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do { try importNarrator(from: url) } catch { issue = error.localizedDescription }
    }
    func importNarrator(from url: URL) throws {
        guard !locked else { return }
        let clip = try AVAudioPlayer(contentsOf: url)
        guard clip.duration.isFinite, clip.duration > 0, clip.duration <= 60 else { throw AudioFailure("Narrator audio must be between 0 and 60 seconds") }
        let relative = try copyAsset(url)
        mutate { $0.scenes[selectedScene].capture?.narrator = relative; $0.scenes[selectedScene].capture?.startMethod = .narrator }
    }
    private func makeNarratorPlayer() throws -> AVAudioPlayer {
        guard let path = scene.capture?.narrator, let url = activeProject.assetURL(path, root: root) else { throw AudioFailure("Choose narrator audio in Scene settings first") }
        if configuredOutputMissing { throw AudioFailure("Selected narrator speakers are disconnected") }
        let clip = try AVAudioPlayer(contentsOf: url)
        guard clip.duration.isFinite, clip.duration > 0, clip.duration <= 60 else { throw AudioFailure("Narrator audio must be between 0 and 60 seconds") }
        if !playbackOutputUID.isEmpty { clip.currentDevice = playbackOutputUID }
        clip.volume = narratorMuted ? 0 : 1
        clip.prepareToPlay()
        return clip
    }
    func previewNarrator() {
        guard !locked else { return }
        do {
            stopNarrator(); narratorMuted = scene.capture?.narratorMuted == true; narratorPlayer = try makeNarratorPlayer()
            guard narratorPlayer?.play() == true else { throw AudioFailure("Narrator playback could not start") }
            previewingNarrator = true; note = "Previewing narrator only; microphone is not recording."
        } catch { stopNarrator(); issue = error.localizedDescription }
    }
    func stopNarrator() {
        narratorPlayer?.stop(); narratorPlayer = nil; previewingNarrator = false
        countdownDeadline = nil; narratorStarted = nil; narratorDuration = 0; countdownRemaining = 0
    }
    func save() {
        guard !locked else { return }
        let errors = project.validation(); guard errors.isEmpty else { issue = errors.joined(separator: "\n"); return }
        do {
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            if FileManager.default.fileExists(atPath: file.path) { try? FileManager.default.copyItem(at: file, to: file.deletingPathExtension().appendingPathExtension("backup-\(Int(Date().timeIntervalSince1970)).relight")) }
            try encoder.encode(project).write(to: file, options: .atomic); dirty = false
            preferences.set(file.path, forKey: "native.project"); note = "Project saved. Participant voice is excluded."; log(note)
        } catch { issue = error.localizedDescription }
    }
    func exportProject() {
        guard !locked, !exportingProject, project.validation().isEmpty else { issue = "Stop playback and fix project validation before exporting"; return }
        let panel = NSSavePanel(); panel.nameFieldStringValue = "RELight Project"; panel.message = "Export a portable folder with films, narrator and authored cues. Participant voice is excluded."
        guard panel.runModal() == .OK, let destination = panel.url else { return }
        let snapshot = project, sourceRoot = root
        exportingProject = true; note = "Exporting a snapshot of the project in the background…"
        Task {
            defer { exportingProject = false }
            do {
                try await Task.detached(priority: .userInitiated) { try Self.writePortableProject(snapshot, root: sourceRoot, to: destination) }.value
                note = "Portable project exported. Participant voice is excluded."
            } catch { issue = "Export failed: \(error.localizedDescription). The original project is unchanged." }
        }
    }
    func exportProject(to destination: URL) throws {
        guard !locked, project.validation().isEmpty else { throw AudioFailure("Fix project validation before exporting") }
        try Self.writePortableProject(project, root: root, to: destination)
    }
    nonisolated static func writePortableProject(_ project: Project, root: URL, to destination: URL) throws {
        guard project.validation().isEmpty else { throw AudioFailure("Fix project validation before exporting") }
        guard !FileManager.default.fileExists(atPath: destination.path) else { throw AudioFailure("Choose a new folder name to preserve existing files") }
        let staging = destination.deletingLastPathComponent().appendingPathComponent(".relight-export-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: staging) }
        try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
        for path in project.referencedMedia {
            guard let source = project.assetURL(path, root: root), let target = project.assetURL(path, root: staging) else { throw AudioFailure("Unsafe media path") }
            try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: source, to: target)
        }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(project).write(to: staging.appendingPathComponent("experience.relight"), options: .atomic)
        try FileManager.default.moveItem(at: staging, to: destination)
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
            stopNarrator(); audio.stopAll(); closeAudience(); liveProject = nil; state = .idle; takeSeconds = 0; issue = nil; project = p; file = url; root = url.deletingLastPathComponent(); selectedScene = 0; selectedCue = nil; frame = 0; undoHistory = []; redoHistory = []; dirty = false
            includedExperienceError = nil; narratorMuted = scene.capture?.narratorMuted == true
            preferences.set(url.path, forKey: "native.project"); refreshMediaAfterEdit(); note = "Project opened. Assign this machine’s devices before exhibition use."
        } catch { issue = error.localizedDescription }
    }

    static func prepareDraftExample(support: URL, resources: URL? = Bundle.main.resourceURL) throws -> URL {
        guard let bundled = resources?.appendingPathComponent("Examples/Draft1"), FileManager.default.fileExists(atPath: bundled.path) else { throw AudioFailure("Draft example is not included in this build") }
        let destination = support.appendingPathComponent("Draft 1 Rehearsal")
        if !FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.copyItem(at: bundled, to: destination)
        } else {
            // Restore omitted bundled files without replacing a recipient's edits.
            let bundledProject = try JSONDecoder().decode(Project.self, from: Data(contentsOf: bundled.appendingPathComponent("experience.relight")))
            for relative in bundledProject.referencedMedia.union(["experience.relight"]) {
                guard let source = bundledProject.assetURL(relative, root: bundled), let target = bundledProject.assetURL(relative, root: destination) else { throw AudioFailure("Unsafe bundled project media path") }
                if !FileManager.default.fileExists(atPath: target.path) {
                    try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try FileManager.default.copyItem(at: source, to: target)
                }
            }
        }
        return destination
    }

    func openDraftExample() {
        guard !locked else { return }
        if dirty { save(); if dirty { return } }
        do {
            let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(Bundle.main.bundleIdentifier?.hasSuffix(".review") == true ? "RELight Native Verification" : "RELight Native")
            let destination = try Self.prepareDraftExample(support: support)
            loadProject(destination.appendingPathComponent("experience.relight"))
            note = "Draft 1 loaded. Scene boundaries are provisional; adjust the source in-point and duration in Edit. Wake still needs film."
        } catch { issue = error.localizedDescription }
    }

    func openIncludedExperience() {
        guard !locked else { return }
        if dirty { save(); if dirty { return } }
        do {
            guard let resources = Bundle.main.resourceURL, let experience = try BundledExperience.read(resources: resources) else { openDraftExample(); return }
            let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(Bundle.main.bundleIdentifier?.hasSuffix(".review") == true ? "RELight Native Verification" : "RELight Native")
            loadProject(try experience.prepare(support: support, resources: resources))
            note = "Included experience opened. Your other projects are unchanged."
        } catch { issue = error.localizedDescription }
    }

    func start() {
        guard !locked else { return }
        if !blockers.isEmpty { issue = blockers.first; showDevices = true; return }
        beginRun(consented: true)
    }
    func beginRun(consented: Bool) {
        previewingFilm = false; seekToken = UUID(); seekInProgress = false
        liveInputUID = nil; liveOutputUID = nil; captureRouteInterrupted = false
        if setup == .exhibition { speed = 1 }
        meterTestStart = nil; stopNarrator(); consent = consented; identifyingDisplay = false; issue = nil; selectedScene = 0; frame = 0; liveProject = project; gateResolved = []; generation += 1
        audio.stopAll(); takeSeconds = 0
        do { try configureAudio(requireInput: activeProject.scenes.contains { $0.capture != nil }) } catch { fail(error.localizedDescription); return }
        if setup == .exhibition { openAudience(identify: false) }
        enterScene(0)
    }
    private func enterScene(_ index: Int) {
        previewReachedEnd = false
        guard activeProject.scenes.indices.contains(index) else { finishRun(); return }
        selectedScene = index; narratorMuted = scene.capture?.narratorMuted == true; frame = 0; ledger.reset(); captureFired = false; audio.stopVoice(); activeCue = nil
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
        player.audioOutputDeviceUniqueID = playbackOutputUID.isEmpty ? nil : playbackOutputUID; player.volume = Float(activeProject.filmLevel)
        log("Preparing scene \(index + 1): \(scene.name)")
        if !previewingFilm && scene.capture?.trigger == .automatic { speed = 1 }
        if !previewingFilm && consent && scene.capture?.trigger == .automatic {
            do { try audio.prepareMicrophone() } catch { consent = false; note = "Microphone unavailable; DREAM-00 will continue without voice"; log(error.localizedDescription) }
        }
    }
    func togglePlayback() {
        if state == .idle || state == .finished { start() }
        else if state == .playing { clockPosition = scenePosition; state = .paused; player.pause(); audio.stopVoice(); audio.pause(); note = "Paused" }
        else if state == .paused {
            do {
                if !previewingFilm || audio.take != nil { try configureAudio(requireInput: false, preserveTake: true); try audio.startEngine() }
                if let original = activeCue, voicePlaybackFrame(original) < original.lengthFrames {
                    let offset = max(0, voicePlaybackFrame(original))
                    let lead = max(0, (activeProject.rate.seconds(original.startFrame) - scenePosition) / speed - activeProject.outputOffsetMs / 1000)
                    if audio.canResumeVoice(original, rate: activeProject.rate, offsetFrames: offset) {
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
        if previewingFilm { seek(0); return }
        audio.stopVoice(); ledger.reset(); enterScene(selectedScene)
    }
    func nextScene() {
        guard setup == .mac, state == .playing || state == .paused else { return }
        if previewingFilm {
            if activeProject.scenes.indices.contains(selectedScene + 1) { enterScene(selectedScene + 1) }
            else { stopFilmPreview(); seek(scene.frames - 1) }
            return
        }
        // Rehearsal navigation still respects unresolved recording gates.
        if scene.capture?.trigger == .gate && !gateResolved.contains(selectedScene) { enterGate(); return }
        enterScene(selectedScene + 1)
    }
    func enterGate() {
        player.pause(); audio.stopVoice(); activeCue = nil; player.volume = Float(activeProject.filmLevel); state = .gate
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
        if captureRouteInterrupted {
            declineAtGate(); issue = "The recording microphone disconnected. This run continues without visitor voice; reselect and test the microphone before the next run."; return
        }
        note = "Ready to record. Use the Mac Record button or the assigned physical control."
        if permission == .authorized { do { try audio.prepareMicrophone() } catch { log(error.localizedDescription) } }
        log("Off-clock recording screen after \(scene.name)")
        if scene.capture?.recordingStart != .button { startRecordingLeadIn() }
    }
    func startRecordingLeadIn(now: Double = ProcessInfo.processInfo.systemUptime) {
        guard state == .gate, let capture = scene.capture else { return }
        stopNarrator()
        if capture.recordingStart == .narrator {
            do {
                narratorPlayer = try makeNarratorPlayer()
                guard narratorPlayer?.play() == true else { throw AudioFailure("Narrator playback could not start") }
                narratorStarted = now; narratorDuration = narratorPlayer?.duration ?? 0
                countdownRemaining = min(3, Int(ceil(narratorDuration)))
            } catch { stopNarrator(); issue = error.localizedDescription; note = "Narrator unavailable. Press Record to start manually, or skip recording."; return }
        } else {
            countdownDeadline = now + Double(capture.delaySeconds); countdownRemaining = capture.delaySeconds
        }
        state = .countdown; note = "Recording starts automatically after the lead-in. Film clock is paused."
    }
    func advanceRecordingLeadIn(now: Double = ProcessInfo.processInfo.systemUptime) {
        guard state == .countdown else { return }
        if let start = narratorStarted {
            let remaining = max(0, narratorDuration - (now - start))
            countdownRemaining = remaining <= 3 ? Int(ceil(remaining)) : 0
            if remaining > 0 || narratorPlayer?.isPlaying == true { return }
        } else if let deadline = countdownDeadline {
            countdownRemaining = max(0, Int(ceil(deadline - now)))
            if now < deadline { return }
        } else { return }
        stopNarrator(); state = .gate; recordAtGate()
    }
    func recordAtGate() {
        guard state == .gate else { return }
        if captureRouteInterrupted { declineAtGate(); issue = "The recording microphone disconnected. This run continues without visitor voice; reselect and test the microphone before the next run."; return }
        stopNarrator(); consent = true
        beginRecording(duration: scene.capture?.recordingMode == .manual ? CaptureCue.manualLimitSeconds : scene.capture?.durationSeconds ?? 6, test: false, manual: scene.capture?.recordingMode == .manual)
    }
    func declineAtGate() {
        guard state == .gate || state == .countdown else { return }
        stopNarrator(); consent = false; audio.clearTake(); audio.releaseMicrophone(); takeSeconds = 0; gateResolved.insert(selectedScene); log("DREAM-00 selected: recording skipped"); continueAfterGate()
    }
    func recordTest(manual: Bool = false) {
        guard !locked else { return }
        meterTestStart = nil
        do { try configureAudio() } catch { issue = error.localizedDescription; return }
        stopNarrator()
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
    func boostLimitForCapture(test: Bool) -> Double {
        if test { return selectedVoice?.boostLimit ?? 1 }
        var result: Double = 1
        for index in selectedScene..<activeProject.scenes.count {
            let s = activeProject.scenes[index]
            let nextCapture = index > selectedScene ? s.capture : nil
            let cutoff = nextCapture.map { $0.trigger == .gate ? ($0.gateFrame ?? s.frames) : $0.startFrame } ?? s.frames
            for cue in s.cues where cue.startFrame < cutoff && (index != selectedScene || (cue.startFrame >= frame && !ledger.hasFired(cue.id))) {
                result = max(result, cue.boostLimit)
            }
            if nextCapture != nil { break }
        }
        return result
    }
    func finishRecording() {
        guard state == .recording else { return }
        let boost = boostLimitForCapture(test: captureForTest)
        do { try audio.finishCapture(boostLimit: boost); takeSeconds = audio.takeSeconds; note = "\(String(format: "%.1f", takeSeconds)) seconds captured · ready for voice cues"; log(note) }
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
        stopNarrator()
        if dry { cue.bypass = true }
        do {
            try configureAudio(requireInput: false, preserveTake: true)
            try audio.play(cue, rate: project.rate, bus: project.voiceLevel)
            auditioning = true; activeCue = cue; auditionStart = ProcessInfo.processInfo.systemUptime
            note = "Auditioning \(dry ? "dry" : "processed") voice · no projector playback"
        } catch { issue = error.localizedDescription }
    }
    private func releaseRunRoutes() {
        if inputUID.isEmpty, let activeInput = liveInputUID, devices.first(where: \.systemInput)?.uid != activeInput { microphonePassed = false }
        if outputUID.isEmpty, let activeOutput = liveOutputUID, devices.first(where: \.systemOutput)?.uid != activeOutput { speakersPassed = false; tonePlayed = false }
        liveInputUID = nil; liveOutputUID = nil; captureRouteInterrupted = false
    }
    func stop(clearMessage: Bool = true) {
        releaseRunRoutes()
        previewingFilm = false; seekToken = UUID(); seekInProgress = false
        meterTestStart = nil; stopNarrator(); previewToken = UUID(); generation += 1; identifyingDisplay = false; player.pause(); audio.stopAll(); activeCue = nil; liveProject = nil; state = .idle; auditioning = false; captureForTest = false; captureManual = false; takeSeconds = 0; recordingSeconds = 0; consent = false; gateResolved = []; frame = 0; selectedScene = min(selectedScene, project.scenes.count - 1)
        if clearMessage { issue = nil; note = "Stopped. Participant recording and effect tails cleared."; log(note) }
        loadPreview()
    }
    private func finishRun() {
        releaseRunRoutes()
        stopNarrator(); player.pause(); audio.stopAll(); activeCue = nil; liveProject = nil; state = .finished; takeSeconds = 0; consent = false
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
        advanceMicrophoneSignalObservation()
        if previewingNarrator && narratorPlayer?.isPlaying != true { stopNarrator(); note = "Narrator preview complete" }
        if seekInProgress { return }
        if state == .countdown { advanceRecordingLeadIn(now: now); return }
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
            clockStart = ProcessInfo.processInfo.systemUptime; state = .playing; note = previewingFilm ? "Previewing \(scene.name) · recording screens skipped" : "Running \(scene.name)"; log(note)
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
        if !previewingFilm, let c = s.capture, c.trigger == .gate, let gate = c.gateFrame, !gateResolved.contains(selectedScene), frame >= gate { enterGate(); return }
        if !previewingFilm, let c = s.capture, c.trigger == .automatic, !captureFired, frame >= c.startFrame {
            captureFired = true
            if consent { beginRecording(duration: c.durationSeconds, test: false) } else { log("Automatic capture skipped: recording disabled, DREAM-00") }
        }
        // Schedule ahead against native host time; no UI timer controls audio onset.
        let horizon = p.rate.frame(scenePosition + 0.06 * speed + max(0, p.outputOffsetMs / 1000) * speed)
        for cue in ledger.due(through: horizon, cues: s.cues) {
            if previewingFilm && audio.take == nil { continue }
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
            if previewingFilm { previewReachedEnd = true; frame = s.frames - 1; player.pause(); audio.stopVoice(); activeCue = nil; state = .paused; note = "Preview reached the end. Scrub or replay from the beginning."; return }
            if state == .recording { finishRecording() }
            if s.capture?.trigger == .gate && !gateResolved.contains(selectedScene) { enterGate() }
            else { enterScene(selectedScene + 1) }
        }
    }

    func openAudience(identify: Bool? = nil) {
        identifyingDisplay = identify ?? (state == .idle && !previewingFilm)
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
    func shutdown() { if let domain = ephemeralPreferenceDomain { preferences.removePersistentDomain(forName: domain) }; deviceRefreshTask?.cancel(); validationTask?.cancel(); mediaValidationToken = UUID(); stopNarrator(); audio.stopAll(); player.pause(); hardware.shutdown(); timer?.invalidate(); topologyTimer?.invalidate() }
}
