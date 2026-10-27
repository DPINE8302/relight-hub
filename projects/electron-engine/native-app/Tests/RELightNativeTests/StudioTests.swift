import Foundation
import Testing
import AVFoundation
import RELightCore
@testable import RELightMac

@MainActor @Test func activeVoicePauseResumeFreezesClockAndRestoresAutomation() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""
    var cue = VoiceCue(startFrame: 0, lengthFrames: 144)
    cue.automation = ["level": [AutomationPoint(frame: 0, value: 0.1), AutomationPoint(frame: 144, value: 0.8)]]
    studio.project.scenes[0].media = nil
    studio.project.scenes[0].cues = [cue]
    studio.beginRun(consented: false)
    // Inject known test PCM after Run clears previous takes; no microphone permission or visitor recording is involved.
    let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 288000)!
    buffer.frameLength = 288000
    for i in 0..<288000 { buffer.floatChannelData![0][i] = Float(sin(Double(i) * 2 * .pi * 220 / 48000) * 0.01) }
    studio.audio.store.begin(seconds: 6, sampleRate: 48000)
    studio.audio.store.consume(buffer)
    try studio.audio.finishCapture()
    studio.tick()
    #expect(studio.state == .playing)
    #expect(studio.audio.voice.isPlaying)
    try await Task.sleep(for: .milliseconds(180))
    studio.tick()
    studio.togglePlayback()
    #expect(studio.state == .paused)
    #expect(!studio.audio.voice.isPlaying)
    #expect(!studio.audio.engine.isRunning)
    let position = studio.scenePosition
    let offset = studio.voicePlaybackFrame(cue)
    #expect(offset > 0 && offset < cue.lengthFrames)
    try await Task.sleep(for: .milliseconds(80))
    studio.tick()
    #expect(studio.scenePosition == position)
    studio.togglePlayback()
    #expect(studio.state == .playing)
    #expect(studio.audio.voice.isPlaying)
    #expect(studio.audio.engine.isRunning)
    #expect(abs(Double(studio.audio.voice.volume) - cue.value(.level, at: offset) * studio.project.voiceLevel) < 0.0001)
    try await Task.sleep(for: .milliseconds(80))
    studio.tick()
    #expect(studio.scenePosition > position)
    #expect(studio.events.filter { $0.text.contains("Voice scheduled at") }.count == 1)
    studio.stop()
    #expect(!studio.audio.voice.isPlaying)
    #expect(studio.audio.take == nil)
}

@MainActor @Test func unchangedEditorValuesPreserveSavedStateAndRedo() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    let title = studio.project.title
    studio.mutate { $0.title = title }
    #expect(!studio.dirty)
    studio.mutate { $0.title = "Edited" }
    studio.undo()
    #expect(studio.project.title == title)
    studio.mutate { $0.title = title }
    studio.redo()
    #expect(studio.project.title == "Edited")
}

@MainActor @Test func rehearsalUsesGateAndDeclineThenCompletes() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""
    studio.project.scenes[0].media = nil
    studio.beginRun(consented: false); studio.tick()
    #expect(studio.state == .playing)
    studio.nextScene()
    #expect(studio.state == .gate)
    #expect(studio.globalFrame == 431)
    studio.declineAtGate(); studio.tick()
    #expect(studio.selectedScene == 1)
    #expect(studio.state == .playing)
    #expect(studio.audio.take == nil)
    for _ in 0..<4 { studio.nextScene(); studio.tick() }
    #expect(studio.state == .finished)
    #expect(studio.takeSeconds == 0)
    #expect(studio.events.contains { $0.text.contains("DREAM-00") })
}

@MainActor @Test func runningProjectRejectsEditsAndStopClearsVoice() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""; studio.project.scenes[0].media = nil
    studio.beginRun(consented: false); studio.tick()
    let previous = studio.project.title
    studio.mutate { $0.title = "Changed during playback" }
    #expect(studio.project.title == previous)
    let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4800)!
    buffer.frameLength = 4800
    for i in 0..<4800 { buffer.floatChannelData![0][i] = 0.1 }
    studio.audio.store.begin(seconds: 0.1, sampleRate: 48000); studio.audio.store.consume(buffer)
    try studio.audio.finishCapture()
    #expect(studio.audio.take != nil)
    studio.stop()
    #expect(studio.state == .idle)
    #expect(studio.audio.take == nil)
    #expect(studio.audio.store.meter.rms == 0)
}

@MainActor @Test func hardwareUnderstandsActualHelperInventoryResponse() throws {
    let hardware = Hardware()
    let response: [String: Any] = ["version": 1, "kind": "response", "command": "inventory.refresh", "ok": true, "devices": [["id": "hid_fixture", "label": "USB input fixture", "assignable": true]]]
    var data = try JSONSerialization.data(withJSONObject: response); data.append(10)
    hardware.receive(data)
    #expect(hardware.devices.count == 1)
    #expect(hardware.devices[0]["id"] as? String == "hid_fixture")
    hardware.receive(Data("{\"version\":1,\"kind\":\"event\",\"event\":\"ready\",\"access\":\"granted\"}\n".utf8))
    #expect(hardware.access == "granted")
}

@MainActor @Test func bundledDraftSchemaFitsOriginalMovieAndRetainsDraftStatus() throws {
    let resource = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/Examples/Draft1/experience.relight")
    let project = try JSONDecoder().decode(Project.self, from: Data(contentsOf: resource))
    #expect(project.validation().isEmpty)
    #expect(project.scenes.count == 5)
    #expect(project.scenes.prefix(4).allSatisfy { $0.media != nil && $0.draft })
    #expect(project.scenes[3].mediaInFrame + project.scenes[3].frames == 2077)
    #expect(project.scenes[4].media == nil)
    #expect(project.scenes[3].cues.count == 1)
    #expect(project.totalFrames == 2413)
}

@MainActor @Test func manualRecordingWaitsForStopAndResumesAuthoredGateFrame() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""
    studio.project.scenes[0].media = nil
    studio.project.scenes[0].capture?.mode = .manual
    studio.project.scenes[0].capture?.gateFrame = 0
    studio.beginRun(consented: false); studio.tick()
    #expect(studio.state == .gate)
    studio.recordAtGate()
    #expect(studio.state == .recording)
    #expect(studio.isManualRecording)
    let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    let input = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 336000)!
    input.frameLength = 336000
    for i in 0..<336000 { input.floatChannelData![0][i] = 0.02 }
    studio.audio.store.begin(seconds: CaptureCue.manualLimitSeconds, sampleRate: 48000); studio.audio.store.consume(input)
    try await Task.sleep(for: .milliseconds(6200))
    studio.tick()
    #expect(studio.state == .recording)
    #expect(studio.globalFrame == 0)
    #expect(!studio.audio.store.finished)
    studio.finishRecording(); studio.tick()
    #expect(studio.state == .playing)
    #expect(studio.selectedScene == 0)
    #expect(studio.takeSeconds >= 7)
    #expect(studio.audio.take != nil)
    studio.stop()
    #expect(studio.takeSeconds == 0)
    #expect(studio.audio.take == nil)
}

@MainActor @Test func decliningAuthoredGateResumesSameSceneWithoutRetriggering() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.project.scenes[0].media = nil
    studio.project.scenes[0].capture?.gateFrame = 0
    studio.beginRun(consented: false); studio.tick()
    #expect(studio.state == .gate)
    studio.declineAtGate(); studio.tick()
    #expect(studio.state == .playing)
    #expect(studio.selectedScene == 0)
    #expect(studio.events.filter { $0.text.contains("Off-clock recording screen") }.count == 1)
    studio.nextScene(); studio.tick()
    #expect(studio.selectedScene == 1)
}

@MainActor @Test func manualTestTakeReturnsToEditorAndCanAuditionLoop() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""
    studio.workspace = .edit
    studio.selectScene(3)
    studio.project.scenes[3].cues[0].startFrame = 0
    studio.project.scenes[3].cues[0].lengthFrames = 240
    studio.project.scenes[3].cues[0].loopToFill = true
    #expect(studio.project.validation().isEmpty)
    studio.recordTest(manual: true)
    #expect(studio.state == .recording)
    #expect(studio.isManualRecording)
    let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    let input = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 144000)!
    input.frameLength = 144000
    for i in 0..<144000 { input.floatChannelData![0][i] = 0.02 }
    studio.audio.store.begin(seconds: CaptureCue.manualLimitSeconds, sampleRate: 48000)
    studio.audio.store.consume(input)
    studio.finishRecording()
    #expect(studio.state == .idle)
    #expect(studio.workspace == .edit)
    #expect(studio.selectedScene == 3)
    #expect(studio.takeSeconds >= 3)
    studio.audition()
    #expect(studio.auditioning)
    #expect(studio.audio.voice.isPlaying)
    let cue = try #require(studio.selectedVoice)
    #expect(try studio.audio.preparedBuffer(for: cue, rate: studio.project.rate).frameLength == 480000)
    studio.stop()
    #expect(!studio.auditioning)
    #expect(studio.audio.take == nil)
}

@Test @MainActor func bundledDraftRestoresMissingVideoAndPreservesEdits() throws {
    let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: temporary) }
    let resources = temporary.appendingPathComponent("resources")
    let bundled = resources.appendingPathComponent("Examples/Draft1")
    try FileManager.default.createDirectory(at: bundled.appendingPathComponent("media"), withIntermediateDirectories: true)
    var bundledProject = Project.starter
    bundledProject.scenes[0].media = "media/Draft 1 scene1-4 .mov"
    bundledProject.scenes[0].capture?.narrator = "media/prompt.wav"
    bundledProject.scenes[0].capture?.startMethod = .narrator
    try JSONEncoder().encode(bundledProject).write(to: bundled.appendingPathComponent("experience.relight"))
    try Data("narrator fixture".utf8).write(to: bundled.appendingPathComponent("media/prompt.wav"))
    let movie = Data("bundled movie".utf8)
    try movie.write(to: bundled.appendingPathComponent("media/Draft 1 scene1-4 .mov"))
    let support = temporary.appendingPathComponent("support")
    try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
    let first = try Studio.prepareDraftExample(support: support, resources: resources)
    #expect(try Data(contentsOf: first.appendingPathComponent("media/Draft 1 scene1-4 .mov")) == movie)
    let edited = Data("recipient edited project".utf8)
    try edited.write(to: first.appendingPathComponent("experience.relight"))
    try FileManager.default.removeItem(at: first.appendingPathComponent("media/Draft 1 scene1-4 .mov"))
    try FileManager.default.removeItem(at: first.appendingPathComponent("media/prompt.wav"))
    let repaired = try Studio.prepareDraftExample(support: support, resources: resources)
    #expect(try Data(contentsOf: repaired.appendingPathComponent("media/prompt.wav")) == Data("narrator fixture".utf8))
    #expect(try Data(contentsOf: repaired.appendingPathComponent("experience.relight")) == edited)
    #expect(try Data(contentsOf: repaired.appendingPathComponent("media/Draft 1 scene1-4 .mov")) == movie)
}


private func writeNarratorFixture(_ url: URL, seconds: Double = 0.25) throws {
    let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(seconds * 48000))!
    buffer.frameLength = buffer.frameCapacity
    for i in 0..<Int(buffer.frameLength) { buffer.floatChannelData![0][i] = 0 }
    let file = try AVAudioFile(forWriting: url, settings: format.settings)
    try file.write(from: buffer)
}

@Test @MainActor func countdownFreezesFilmAndSkipOrStopCannotRecordLater() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""
    studio.project.scenes[0].media = nil
    studio.project.scenes[0].capture?.gateFrame = 0
    studio.project.scenes[0].capture?.startMethod = .countdown
    studio.project.scenes[0].capture?.countdownSeconds = 3
    studio.beginRun(consented: true); studio.tick()
    #expect(studio.state == .countdown)
    #expect(studio.countdownRemaining == 3)
    #expect(studio.globalFrame == 0)
    #expect(studio.takeSeconds == 0)
    studio.declineAtGate()
    #expect(studio.state == .playing)
    studio.advanceRecordingLeadIn(now: ProcessInfo.processInfo.systemUptime + 100)
    #expect(studio.state == .playing)
    #expect(studio.audio.take == nil)
    studio.stop()
    studio.state = .gate
    studio.startRecordingLeadIn(now: 10)
    studio.advanceRecordingLeadIn(now: 11)
    #expect(studio.countdownRemaining == 2)
    studio.stop()
    studio.advanceRecordingLeadIn(now: 100)
    #expect(studio.state == .idle)
    #expect(studio.countdownRemaining == 0)
    #expect(studio.audio.take == nil)
}

@Test @MainActor func missingNarratorFallsBackToManualAndMutedNarratorCanBeCancelled() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""
    studio.project.scenes[0].media = nil
    studio.project.scenes[0].capture?.gateFrame = 0
    studio.project.scenes[0].capture?.startMethod = .narrator
    studio.project.scenes[0].capture?.narrator = "media/missing.wav"
    studio.beginRun(consented: true); studio.tick()
    #expect(studio.state == .gate)
    #expect(studio.issue != nil)
    studio.stop()
    let clip = root.appendingPathComponent("prompt.wav")
    try writeNarratorFixture(clip)
    try studio.importNarrator(from: clip)
    studio.project.scenes[0].capture?.narratorMuted = true
    studio.beginRun(consented: true); studio.tick()
    #expect(studio.state == .countdown)
    #expect(studio.audio.take == nil)
    #expect(studio.globalFrame == 0)
    studio.narratorMuted = true
    studio.stop()
    studio.advanceRecordingLeadIn(now: ProcessInfo.processInfo.systemUptime + 100)
    #expect(studio.state == .idle)
    #expect(!studio.previewingNarrator)
}

@Test @MainActor func narratorAndFilmExportTogetherAndFailedExportLeavesNoPartialFolder() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root.appendingPathComponent("source"), startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    let clip = root.appendingPathComponent("prompt.wav")
    try writeNarratorFixture(clip)
    studio.project.scenes[0].media = nil
    try studio.importNarrator(from: clip)
    studio.project.scenes[0].capture?.narratorMuted = true
    let exported = root.appendingPathComponent("exported")
    try studio.exportProject(to: exported)
    let p = try JSONDecoder().decode(Project.self, from: Data(contentsOf: exported.appendingPathComponent("experience.relight")))
    #expect(p == studio.project)
    let narration = try #require(p.scenes[0].capture?.narrator)
    #expect(try Data(contentsOf: exported.appendingPathComponent(narration)) == Data(contentsOf: clip))
    studio.project.scenes[1].media = "media/not-supplied.mov"
    let failed = root.appendingPathComponent("failed-export")
    #expect(throws: (any Error).self) { try studio.exportProject(to: failed) }
    #expect(!FileManager.default.fileExists(atPath: failed.path))
    #expect(try FileManager.default.contentsOfDirectory(atPath: root.path).allSatisfy { !$0.hasPrefix(".relight-export-") })
    studio.loadProject(exported.appendingPathComponent("experience.relight"))
    #expect(studio.project == p)
    #expect(studio.project.scenes[0].capture?.narratorMuted == true)
}

@Test @MainActor func filmReplacementResetsSourceAndUndoRedoInvalidateMediaChecks() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    let source = root.appendingPathComponent("new-scene.mov")
    try Data("fixture movie bytes".utf8).write(to: source)
    studio.selectedScene = 3
    studio.project.scenes[3].mediaInFrame = 1530
    let before = studio.project
    studio.mediaChecks[studio.scene.id] = MediaCheck(valid: true, detail: "Previous film")
    try studio.importMedia(from: source)
    #expect(studio.scene.mediaInFrame == 0)
    #expect(studio.scene.frames == before.scenes[3].frames)
    #expect(studio.scene.cues == before.scenes[3].cues)
    #expect(studio.scene.draft)
    #expect(studio.mediaChecks.isEmpty)
    let after = studio.project
    studio.undo()
    #expect(studio.project == before)
    #expect(studio.mediaChecks.isEmpty)
    studio.redo()
    #expect(studio.project == after)
    #expect(try Data(contentsOf: source) == Data("fixture movie bytes".utf8))
}


@Test @MainActor func automaticCountdownStartsCaptureOnceAndMutedNarratorCompletesBeforeCapture() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""
    studio.project.scenes[0].media = nil
    studio.project.scenes[0].capture?.gateFrame = 0
    studio.project.scenes[0].capture?.startMethod = .countdown
    studio.project.scenes[0].capture?.countdownSeconds = 0
    studio.start(); studio.tick(); studio.tick()
    #expect(studio.state == .recording)
    #expect(studio.globalFrame == 0)
    let count = studio.events.filter { $0.text == "Recording participant voice" }.count
    studio.advanceRecordingLeadIn(now: ProcessInfo.processInfo.systemUptime + 100)
    #expect(studio.events.filter { $0.text == "Recording participant voice" }.count == count)
    studio.stop()
    let clip = root.appendingPathComponent("prompt.wav")
    try writeNarratorFixture(clip, seconds: 0.3)
    try studio.importNarrator(from: clip)
    studio.project.scenes[0].capture?.narratorMuted = true
    studio.start(); studio.tick()
    #expect(studio.state == .countdown)
    #expect(studio.audio.take == nil)
    #expect(studio.globalFrame == 0)
    try await Task.sleep(for: .milliseconds(650))
    studio.tick()
    #expect(studio.state == .recording)
    #expect(studio.globalFrame == 0)
    studio.stop()
    #expect(studio.audio.take == nil)
}

@Test @MainActor func pendingMicrophoneCheckCannotInterruptRecording() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""
    studio.testMicrophone()
    studio.recordTest(manual: true)
    #expect(studio.state == .recording)
    let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 48000)!
    pcm.frameLength = 48000
    for i in 0..<48000 { pcm.floatChannelData![0][i] = 0.05 }
    studio.audio.store.begin(seconds: 600, sampleRate: 48000); studio.audio.store.consume(pcm)
    try await Task.sleep(for: .milliseconds(2200))
    studio.tick()
    studio.finishRecording()
    #expect(studio.takeSeconds >= 1)
    #expect(studio.audio.take != nil)
}


@Test @MainActor func assignedControlDisconnectCancelsCountdownInMacModeAndGateRestoresFilmLevel() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""
    studio.project.scenes[0].media = nil
    studio.project.scenes[0].capture?.gateFrame = 0
    studio.project.scenes[0].capture?.startMethod = .countdown
    studio.hardware.bindings = [["role": "RECORD_BUTTON", "deviceId": "qa"]]
    studio.beginRun(consented: true); studio.tick()
    #expect(studio.state == .countdown)
    studio.hardware.onDisconnect?()
    #expect(studio.state == .idle)
    studio.advanceRecordingLeadIn(now: ProcessInfo.processInfo.systemUptime + 100)
    #expect(studio.state == .idle)
    studio.project.scenes[0].capture?.startMethod = .button
    studio.beginRun(consented: true)
    studio.player.volume = Float(studio.project.filmLevel * studio.project.duckLevel)
    studio.enterGate()
    #expect(studio.player.volume == Float(studio.project.filmLevel))
    studio.declineAtGate()
    #expect(studio.player.volume == Float(studio.project.filmLevel))
}

@Test @MainActor func sceneMuteChangesLivePreviewWithoutRestartingOrStoppingIt() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""
    let clip = root.appendingPathComponent("prompt.wav")
    try writeNarratorFixture(clip, seconds: 5)
    try studio.importNarrator(from: clip)
    studio.previewNarrator()
    #expect(studio.previewingNarrator)
    studio.mutate { $0.scenes[0].capture?.narratorMuted = true }
    #expect(studio.previewingNarrator)
    #expect(studio.narratorMuted)
    studio.mutate { $0.scenes[0].capture?.narratorMuted = false }
    #expect(studio.previewingNarrator)
    #expect(!studio.narratorMuted)
    studio.stopNarrator()
}


@Test @MainActor func realMovieReplacementCanFitSaveReopenAndPlay() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""
    let movie = root.appendingPathComponent("finished-scene.mov")
    try await writeMovieFixture(movie)
    studio.project.scenes[0].capture = nil
    try studio.importMedia(from: movie)
    await studio.validateMedia()
    #expect(studio.mediaChecks[studio.scene.id]?.valid == false)
    // Keep the starter's completed recording source for later cues while fitting scene zero.
    studio.project.scenes[0].capture = CaptureCue()
    studio.project.scenes[0].capture?.gateFrame = 0
    await studio.useFullClip()
    #expect(studio.scene.frames == 24)
    #expect(studio.scene.mediaInFrame == 0)
    #expect(studio.project.validation().isEmpty)
    await studio.validateMedia()
    #expect(studio.mediaChecks[studio.scene.id]?.valid == true)
    studio.save()
    #expect(!studio.dirty)
    let saved = studio.project
    studio.loadProject(root.appendingPathComponent("experience.relight"))
    await studio.validateMedia()
    #expect(studio.project == saved)
    #expect(studio.mediaChecks[studio.scene.id]?.valid == true)
    studio.beginRun(consented: false)
    let deadline = ProcessInfo.processInfo.systemUptime + 5
    while studio.state == .preparing, ProcessInfo.processInfo.systemUptime < deadline { try await Task.sleep(for: .milliseconds(20)); studio.tick() }
    #expect(studio.state == .gate)
    studio.declineAtGate()
    try await Task.sleep(for: .milliseconds(300)); studio.tick()
    #expect(studio.state == .playing)
    #expect(studio.scenePosition > 0)
    studio.stop()
    studio.seek(6)
    studio.inputUID = "missing-preview-microphone"
    studio.toggleFilmPreview()
    let previewDeadline = ProcessInfo.processInfo.systemUptime + 5
    while studio.state == .preparing, ProcessInfo.processInfo.systemUptime < previewDeadline { try await Task.sleep(for: .milliseconds(20)); studio.tick() }
    #expect(studio.previewingFilm)
    #expect(studio.state == .playing)
    #expect(studio.scenePosition >= 0.25)
    #expect(studio.events.filter { $0.text.contains("Off-clock recording screen") }.count == 1)
    studio.restartScene()
    try await Task.sleep(for: .milliseconds(80)); studio.tick()
    #expect(studio.state == .playing)
    #expect(studio.previewingFilm)
    studio.toggleFilmPreview()
    #expect(studio.state == .paused)
    studio.seek(12)
    try await Task.sleep(for: .milliseconds(80))
    studio.toggleFilmPreview()
    #expect(studio.state == .playing)
    #expect(studio.previewingFilm)
    studio.stopFilmPreview()
    #expect(studio.state == .idle)
    #expect(!studio.previewingFilm)
    studio.seek(23)
    try await Task.sleep(for: .milliseconds(80))
    studio.toggleFilmPreview()
    let lastDeadline = ProcessInfo.processInfo.systemUptime + 5
    while studio.state == .preparing, ProcessInfo.processInfo.systemUptime < lastDeadline { try await Task.sleep(for: .milliseconds(20)); studio.tick() }
    #expect(studio.frame >= 23)
    try await Task.sleep(for: .milliseconds(80)); studio.tick()
    #expect(studio.state == .paused)
    var next = studio.project.scenes[0]; next.id = UUID(); next.capture = nil; next.cues = []
    studio.project.scenes.append(next)
    studio.nextScene()
    let nextDeadline = ProcessInfo.processInfo.systemUptime + 5
    while studio.state == .preparing, ProcessInfo.processInfo.systemUptime < nextDeadline { try await Task.sleep(for: .milliseconds(20)); studio.tick() }
    try await Task.sleep(for: .milliseconds(150)); studio.tick()
    studio.toggleFilmPreview()
    let pausedPosition = studio.scenePosition
    #expect(studio.state == .paused)
    #expect(pausedPosition >= 0.1)
    studio.toggleFilmPreview()
    try await Task.sleep(for: .milliseconds(30)); studio.tick()
    #expect(studio.scenePosition >= pausedPosition)
    studio.stopFilmPreview()
}


@Test @MainActor func bundledAinsleyCopiesIntoProjectAndUndoPreservesPreviousRecordingStart() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root.appendingPathComponent("project"), startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    let resources = root.appendingPathComponent("resources")
    try FileManager.default.createDirectory(at: resources.appendingPathComponent("Narration"), withIntermediateDirectories: true)
    let source = resources.appendingPathComponent("Narration/" + Studio.defaultNarratorFile)
    let fixture = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/Narration/" + Studio.defaultNarratorFile)
    try FileManager.default.copyItem(at: fixture, to: source)
    let before = studio.project
    studio.useBundledNarrator(resources: resources)
    #expect(studio.scene.capture?.recordingStart == .narrator)
    let relative = try #require(studio.scene.capture?.narrator)
    #expect(try Data(contentsOf: studio.root.appendingPathComponent(relative)) == Data(contentsOf: source))
    studio.undo()
    #expect(studio.project == before)
    studio.redo()
    #expect(studio.scene.capture?.narrator == relative)
    let exported = root.appendingPathComponent("exported")
    studio.project.scenes[0].media = nil
    try studio.exportProject(to: exported)
    #expect(try Data(contentsOf: exported.appendingPathComponent(relative)) == Data(contentsOf: source))
}


@Test @MainActor func sourceTimecodeSeekAndFrameStepsPreserveExactAuthoredCues() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.project.timecodeStartFrame = 86400
    studio.project.scenes = [Scene(name: "Film", thai: "", frames: 6843, capture: CaptureCue(), cues: [VoiceCue(startFrame: 5186, lengthFrames: 163)])]
    studio.project.scenes[0].capture?.gateFrame = 439
    studio.project.blackFromFrame = nil
    #expect(studio.timecode == "01:00:00:00")
    #expect(studio.jumpToTimecode("01:03:36:02"))
    #expect(studio.frame == 5186)
    #expect(studio.timecode == "01:03:36:02")
    studio.stepFrames(-1)
    #expect(studio.frame == 5185)
    studio.jumpToRecording()
    #expect(studio.frame == 439)
    studio.jumpToDream()
    #expect(studio.frame == 5186)
    let frame = studio.frame
    #expect(!studio.jumpToTimecode("01:03:36:24"))
    #expect(!studio.jumpToTimecode("01:99:00:00"))
    #expect(!studio.jumpToTimecode("00:00:00:00"))
    #expect(studio.frame == frame)
    #expect(studio.scene.cues[0].startFrame == 5186)
    studio.state = .recording
    studio.stepFrames(10)
    #expect(studio.frame == frame)
}

@Test @MainActor func automaticExhibitionCanOmitUSBAndAlwaysResetsToRealtimeSpeed() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.project.requiresPhysicalControls = false
    studio.speed = 4
    studio.chooseExhibition()
    #expect(studio.speed == 1)
    #expect(!studio.blockers.contains { $0.contains("Assign and test") })
    studio.project.requiresPhysicalControls = true
    studio.hardware.bindings = []
    #expect(studio.blockers.contains { $0.contains("Assign and test") })
    studio.setup = .exhibition
    studio.speed = 4
    studio.inputUID = ""; studio.outputUID = ""
    studio.beginRun(consented: false)
    #expect(studio.speed == 1)
    studio.stop()
}


@Test @MainActor func exhaustedFiniteRepeatResumesFilmAndRetainsTheTake() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""; studio.project.scenes[0].media = nil
    var cue = VoiceCue(startFrame: 0, lengthFrames: 144)
    cue.repeatCount = 2
    studio.project.scenes[0].cues = [cue]
    studio.beginRun(consented: false)
    let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 48000)!
    buffer.frameLength = 48000
    for i in 0..<48000 { buffer.floatChannelData![0][i] = 0.01 }
    studio.audio.store.begin(seconds: 1, sampleRate: 48000); studio.audio.store.consume(buffer)
    try studio.audio.finishCapture(); studio.tick()
    #expect(studio.audio.take != nil)
    try await Task.sleep(for: .milliseconds(2200)); studio.tick()
    studio.togglePlayback()
    #expect(studio.state == .paused)
    studio.togglePlayback()
    #expect(studio.state == .playing)
    #expect(studio.audio.take != nil)
    #expect(studio.player.volume == Float(studio.project.filmLevel))
    #expect(studio.issue == nil)
    studio.stop()
}


@MainActor private func writeMovieFixture(_ movie: URL, frames: Int = 24) async throws {
    let writer = try AVAssetWriter(outputURL: movie, fileType: .mov)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 64, AVVideoHeightKey: 36])
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: 64, kCVPixelBufferHeightKey as String: 36])
    writer.add(input)
    #expect(writer.startWriting())
    writer.startSession(atSourceTime: .zero)
    var pixel: CVPixelBuffer?
    #expect(CVPixelBufferCreate(kCFAllocatorDefault, 64, 36, kCVPixelFormatType_32ARGB, nil, &pixel) == kCVReturnSuccess)
    let buffer = try #require(pixel)
    CVPixelBufferLockBaseAddress(buffer, [])
    CVPixelBufferGetBaseAddress(buffer)!.initializeMemory(as: UInt8.self, repeating: 0, count: CVPixelBufferGetBytesPerRow(buffer) * 36)
    CVPixelBufferUnlockBaseAddress(buffer, [])
    for frame in 0..<frames {
        let deadline = ProcessInfo.processInfo.systemUptime + 5
        while !input.isReadyForMoreMediaData, ProcessInfo.processInfo.systemUptime < deadline { try await Task.sleep(for: .milliseconds(2)) }
        #expect(adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(frame), timescale: 24)))
    }
    writer.endSession(atSourceTime: CMTime(value: Int64(frames), timescale: 24)); input.markAsFinished()
    await writer.finishWriting()
    #expect(writer.status == .completed)
}

@Test @MainActor func anAlreadyMissingMicrophoneCannotRepeatedlyStopPlayback() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = "missing-old-microphone"; studio.outputUID = "connected-speakers"
    let output = SoundDevice(id: 100, uid: "connected-speakers", name: "Connected speakers", input: false, output: true)
    studio.applyDeviceInventory([output], screens: [])
    studio.state = .playing; studio.microphonePassed = false; studio.speakersPassed = true
    for _ in 0..<5 { studio.applyDeviceInventory([output], screens: []) }
    #expect(studio.state == .playing)
    #expect(studio.issue == nil)
    #expect(studio.speakersPassed)
    #expect(studio.configuredInputMissing)
}

@Test @MainActor func systemRouteChangeInvalidatesOnlyTheChangedRole() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""
    let mic = SoundDevice(id: 1, uid: "mic", name: "Mic", input: true, output: false, systemInput: true)
    let oldOutput = SoundDevice(id: 2, uid: "old", name: "Old", input: false, output: true, systemOutput: true)
    let newOutput = SoundDevice(id: 3, uid: "new", name: "New", input: false, output: true, systemOutput: true)
    studio.applyDeviceInventory([mic, oldOutput], screens: [])
    studio.microphonePassed = true; studio.speakersPassed = true
    studio.applyDeviceInventory([mic, newOutput], screens: [])
    #expect(studio.microphonePassed)
    #expect(!studio.speakersPassed)
    studio.state = .playing
    studio.applyDeviceInventory([mic, oldOutput], screens: [])
    #expect(studio.state == .idle)
    #expect(studio.issue?.contains("speakers") == true)
}

@Test @MainActor func changingOnlyDisplayPreservesAudioChecksAndTemporaryTake() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = ""; studio.outputUID = ""; studio.deviceChanged()
    studio.microphonePassed = true; studio.speakersPassed = true
    let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4800)!
    pcm.frameLength = 4800
    for i in 0..<4800 { pcm.floatChannelData![0][i] = 0.05 }
    studio.audio.store.begin(seconds: 0.1, sampleRate: 48000); studio.audio.store.consume(pcm); try studio.audio.finishCapture()
    studio.screenID = "new-display"; studio.deviceChanged()
    #expect(studio.microphonePassed)
    #expect(studio.speakersPassed)
    #expect(studio.audio.take != nil)
    #expect(!studio.projectorPassed)
}

@Test @MainActor func disconnectedMicrophoneCannotPassFromAnEarlierMeterPeak() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.inputUID = "mic"; studio.outputUID = ""
    let mic = SoundDevice(id: 1, uid: "mic", name: "Mic", input: true, output: false)
    studio.applyDeviceInventory([mic], screens: [])
    studio.beginMicrophoneSignalObservation(now: Date(timeIntervalSince1970: 0))
    let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4800)!
    pcm.frameLength = 4800
    for i in 0..<4800 { pcm.floatChannelData![0][i] = 0.1 }
    studio.audio.store.consume(pcm)
    studio.advanceMicrophoneSignalObservation(now: Date(timeIntervalSince1970: 1))
    studio.applyDeviceInventory([], screens: [])
    studio.advanceMicrophoneSignalObservation(now: Date(timeIntervalSince1970: 3))
    #expect(!studio.microphonePassed)
}

@Test @MainActor func macRoutesAndExhibitionRoutesPersistSeparately() throws {
    let name = "RELight-stability-" + UUID().uuidString
    let prefs = try #require(UserDefaults(suiteName: name))
    defer { prefs.removePersistentDomain(forName: name) }
    prefs.set("Exhibition", forKey: "native.setup")
    prefs.set("exhibition-mic", forKey: "native.input")
    prefs.set("exhibition-output", forKey: "native.output")
    prefs.set("external-display", forKey: "native.screen")
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, preferences: prefs, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    #expect(studio.setup == .exhibition)
    #expect(studio.inputUID == "exhibition-mic")
    studio.continueWithMac()
    studio.inputUID = "local-mic"; studio.outputUID = "local-output"; studio.deviceChanged()
    #expect(prefs.string(forKey: "native.input") == "exhibition-mic")
    let restarted = makeTestStudio(storageRoot: root.appendingPathComponent("restart"), startHardware: false, preferences: prefs, scanDevices: false)
    defer { restarted.shutdown() }
    #expect(restarted.setup == .mac)
    #expect(restarted.inputUID == "local-mic")
    #expect(restarted.outputUID == "local-output")
    restarted.chooseExhibition()
    #expect(restarted.inputUID == "exhibition-mic")
    #expect(restarted.outputUID == "exhibition-output")
}

@Test @MainActor func fullFilmReplacementPreservesCueFramesAndRejectsShortExports() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    let full = root.appendingPathComponent("new-export.mov")
    try await writeMovieFixture(full, frames: 48)
    var scene = Scene(name: "Film", thai: "", frames: 24, capture: CaptureCue(), cues: [VoiceCue(startFrame: 12, lengthFrames: 6)])
    scene.capture?.gateFrame = 0; scene.draft = false
    studio.project.scenes = [scene]; studio.project.blackFromFrame = nil; studio.project.timecodeStartFrame = 86400
    let old = studio.project
    try await studio.importMovie(from: full, fitScene: true)
    #expect(studio.scene.frames == 48)
    #expect(studio.scene.cues == old.scenes[0].cues)
    #expect(studio.scene.capture == old.scenes[0].capture)
    #expect(studio.project.timecodeStartFrame == 86400)
    #expect(studio.scene.draft)
    await studio.validateMedia()
    #expect(studio.mediaChecks[studio.scene.id]?.valid == true)
    let imported = studio.project
    let short = root.appendingPathComponent("short-export.mov")
    try await writeMovieFixture(short, frames: 6)
    do { try await studio.importMovie(from: short, fitScene: true); Issue.record("Short export incorrectly accepted") } catch {}
    #expect(studio.project == imported)
    #expect(!studio.importingMedia)
    let destination = root.appendingPathComponent("portable")
    try await Task.detached { try Studio.writePortableProject(imported, root: root, to: destination) }.value
    let restored = try JSONDecoder().decode(Project.self, from: Data(contentsOf: destination.appendingPathComponent("experience.relight")))
    #expect(restored == imported)
}


@Test @MainActor func cancellingAReplacementKeepsTheOriginalProjectAndRemovesTheNewAsset() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    let movie = root.appendingPathComponent("new.mov")
    try await writeMovieFixture(movie, frames: 48)
    let original = studio.project
    let task = Task { try await studio.importMovie(from: movie, fitScene: true) }
    for _ in 0..<100 where !studio.importingMedia { await Task.yield() }
    #expect(studio.importingMedia)
    studio.cancelMediaImport()
    do { try await task.value; Issue.record("Cancelled replacement unexpectedly completed") } catch is CancellationError {} catch { Issue.record("Unexpected import error: \(error)") }
    #expect(studio.project == original)
    #expect(!studio.importingMedia)
    #expect(try FileManager.default.contentsOfDirectory(atPath: root.appendingPathComponent("media").path).isEmpty)
}

@Test @MainActor func changingOutputStopsANarratorPreview() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    let clip = root.appendingPathComponent("prompt.wav")
    try writeNarratorFixture(clip, seconds: 5)
    try studio.importNarrator(from: clip)
    studio.inputUID = ""; studio.outputUID = ""
    studio.project.scenes[0].capture?.narratorMuted = true
    let first = SoundDevice(id: 1, uid: "first", name: "First", input: false, output: true, systemOutput: true)
    let second = SoundDevice(id: 2, uid: "second", name: "Second", input: false, output: true, systemOutput: true)
    studio.applyDeviceInventory([first], screens: [])
    studio.previewNarrator()
    #expect(studio.previewingNarrator)
    studio.applyDeviceInventory([second], screens: [])
    #expect(!studio.previewingNarrator)
    #expect(studio.issue?.contains("Narrator speakers") == true)
}


@Test @MainActor func profileAndOutputChangesCannotPassAnOldMicrophoneObservation() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4800)!
    pcm.frameLength = 4800
    for i in 0..<4800 { pcm.floatChannelData![0][i] = 0.1 }
    for change in 0..<3 {
        studio.setup = .mac; studio.inputUID = "mic"; studio.outputUID = ""; studio.deviceChanged()
        studio.microphonePassed = false
        studio.beginMicrophoneSignalObservation(now: Date(timeIntervalSince1970: 0))
        studio.audio.store.consume(pcm)
        studio.advanceMicrophoneSignalObservation(now: Date(timeIntervalSince1970: 1))
        if change == 0 { studio.continueWithMac() }
        else if change == 1 { studio.chooseExhibition() }
        else { studio.outputUID = "new-output"; studio.deviceChanged() }
        studio.advanceMicrophoneSignalObservation(now: Date(timeIntervalSince1970: 3))
        #expect(!studio.microphonePassed)
    }
}

@Test @MainActor func aRunPinsSystemInputThroughDefaultChangesAndPauseResume() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = makeTestStudio(storageRoot: root, startHardware: false, scanDevices: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    let inventory = DeviceCatalog.devices()
    let originalMic = try #require(inventory.first { $0.systemInput })
    let originalOutput = try #require(inventory.first { $0.systemOutput })
    studio.inputUID = ""; studio.outputUID = ""; studio.project.scenes[0].media = nil
    studio.applyDeviceInventory(inventory, screens: [])
    studio.beginRun(consented: false); studio.tick()
    #expect(studio.state == .playing)
    #expect(studio.captureInputUID == originalMic.uid)
    #expect(studio.playbackOutputUID == originalOutput.uid)
    var changed = inventory.map { device in var result = device; result.systemInput = false; return result }
    changed.append(SoundDevice(id: 900001, uid: "unselected-system-mic", name: "Other", input: true, output: false, systemInput: true))
    studio.applyDeviceInventory(changed, screens: [])
    #expect(studio.captureInputUID == originalMic.uid)
    studio.togglePlayback(); studio.togglePlayback()
    #expect(studio.state == .playing)
    #expect(studio.audio.configuredInputUID == originalMic.uid)
    #expect(studio.playbackOutputUID == originalOutput.uid)
}
