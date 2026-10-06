import Foundation
import Testing
import AVFoundation
import RELightCore
@testable import RELightMac

@MainActor @Test func activeVoicePauseResumeFreezesClockAndRestoresAutomation() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = Studio(storageRoot: root, startHardware: false)
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
    let studio = Studio(storageRoot: root, startHardware: false)
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
    let studio = Studio(storageRoot: root, startHardware: false)
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
    let studio = Studio(storageRoot: root, startHardware: false)
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
    let studio = Studio(storageRoot: root, startHardware: false)
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
    let studio = Studio(storageRoot: root, startHardware: false)
    defer { studio.shutdown(); try? FileManager.default.removeItem(at: root) }
    studio.project.scenes[0].media = nil
    studio.project.scenes[0].capture?.gateFrame = 0
    studio.beginRun(consented: false); studio.tick()
    #expect(studio.state == .gate)
    studio.declineAtGate(); studio.tick()
    #expect(studio.state == .playing)
    #expect(studio.selectedScene == 0)
    #expect(studio.events.filter { $0.text.contains("Off-clock consent gate") }.count == 1)
    studio.nextScene(); studio.tick()
    #expect(studio.selectedScene == 1)
}

@MainActor @Test func manualTestTakeReturnsToEditorAndCanAuditionLoop() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let studio = Studio(storageRoot: root, startHardware: false)
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
