import Foundation
import Testing
@testable import RELightCore

@Test func starterMatchesV5() {
    let p = Project.starter
    #expect(p.validation().isEmpty)
    #expect(p.totalFrames == 2880)
    #expect(p.rate.seconds(p.totalFrames) == 120)
    #expect(p.scenes[0].frames == 432)
    #expect(p.scenes[0].capture?.trigger == .gate)
    #expect(p.scenes.flatMap(\.cues).count == 1)
    #expect(p.globalFrame(scene: 3, localFrame: p.scenes[3].cues[0].startFrame) == 2352)
    #expect(p.blackFromFrame == 2808)
}
@Test func frameConversions() {
    let r = FrameRate()
    #expect(r.timecode(570) == "00:00:23:18")
    #expect(r.frame(r.seconds(2352)) == 2352)
    let ntsc = FrameRate(numerator: 24000, denominator: 1001)
    #expect(abs(ntsc.seconds(24000) - 1001) < 0.0001)
}
@Test func sourceCannotEscapeRoot() throws {
    let p = Project.starter, root = URL(fileURLWithPath: "/tmp/relight-test")
    #expect(p.assetURL("../private.wav", root: root) == nil)
    #expect(p.assetURL("/etc/passwd", root: root) == nil)
    #expect(p.assetURL("https://example.com/a.mp4", root: root) == nil)
    #expect(p.assetURL("media/a.mp4", root: root)?.path == "/tmp/relight-test/media/a.mp4")
    let testRoot = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: testRoot, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: testRoot) }
    try FileManager.default.createSymbolicLink(at: testRoot.appendingPathComponent("escape"), withDestinationURL: URL(fileURLWithPath: "/etc"))
    #expect(p.assetURL("escape/passwd", root: testRoot) == nil)
}
@Test func projectRoundTripAndNoVoiceBytes() throws {
    var p = Project.starter
    p.scenes[3].cues[0].effects = .preset("Distorted")
    p.scenes[3].cues[0].automation["level"] = [.init(frame: 0, value: 0.8), .init(frame: 192, value: 0)]
    p.effectPresets["Custom"] = .preset("Echo")
    let data = try JSONEncoder().encode(p)
    #expect(try JSONDecoder().decode(Project.self, from: data) == p)
    let text = String(decoding: data, as: UTF8.self)
    #expect(!text.contains("samples"))
    #expect(!text.contains("audioBuffer"))
}
@Test func automationInterpolatesAndRejectsUnsafeValues() {
    var p = Project.starter
    p.scenes[3].cues[0].automation["level"] = [.init(frame: 0, value: 1), .init(frame: 100, value: 0)]
    #expect(p.scenes[3].cues[0].value(.level, at: 50) == 0.5)
    #expect(p.scenes[3].cues[0].value(.level, at: 150) == 0)
    p.scenes[3].cues[0].automation["feedback"] = [.init(frame: 0, value: 0.9)]
    #expect(!p.validation().isEmpty)
}
@Test func cuesRequireCaptureAndFitScene() {
    var p = Project.starter
    p.scenes[0].capture = nil
    #expect(p.validation().contains { $0.contains("completed recording") })
    p = .starter; p.scenes[3].cues[0].startFrame = 900
    #expect(p.validation().contains { $0.contains("exceeds scene") })
}
@Test func automaticCaptureMustCompleteBeforeReplay() {
    var p = Project.starter
    p.scenes[0].capture = .init(trigger: .automatic, startFrame: 0, durationSeconds: 6)
    p.scenes[0].cues = [VoiceCue(startFrame: 144, lengthFrames: 48)]
    #expect(p.validation().contains { $0.contains("completed recording") })
    p.scenes[0].cues[0].startFrame = 147
    #expect(p.validation().isEmpty)
    p.scenes[0].capture?.startFrame = 400
    #expect(p.validation().contains { $0.contains("recording window") })
}
@Test func onceOnlyAndSeekSemantics() {
    let a = VoiceCue(startFrame: 10), b = VoiceCue(startFrame: 20)
    var ledger = CueLedger()
    #expect(ledger.due(through: 9, cues: [a, b]).isEmpty)
    #expect(ledger.due(through: 10, cues: [a, b]).map(\.id) == [a.id])
    #expect(ledger.due(through: 15, cues: [a, b]).isEmpty)
    ledger.skip(through: 21, cues: [a, b])
    #expect(ledger.due(through: 30, cues: [a, b]).isEmpty)
    ledger.reset()
    #expect(ledger.due(through: 30, cues: [b, a]).map(\.id) == [a.id, b.id])
}
@Test func invalidConfigurationsCannotRun() {
    var p = Project.starter
    p.scenes[3].cues[0].effects.feedback = .infinity
    #expect(!p.validation().isEmpty)
    p = .starter; p.scenes[3].cues.append(VoiceCue(startFrame: 750, lengthFrames: 48))
    #expect(p.validation().contains { $0.contains("overlap") })
    p = .starter; p.rate.denominator = 0
    #expect(!p.validation().isEmpty)
    p = .starter; p.schemaVersion = 9
    #expect(!p.validation().isEmpty)
}

@Test func untrustedProjectIntegersCannotOverflowValidation() {
    var project = Project.starter
    project.scenes[0].frames = Int.max
    #expect(!project.validation().isEmpty)
    project = Project.starter
    project.scenes[3].cues[0].startFrame = Int.max
    #expect(!project.validation().isEmpty)
}

@Test func outputCompensationMovesAutomationAndCueEndWithPlayback() {
    let cue = VoiceCue(startFrame: 48, lengthFrames: 144), rate = FrameRate()
    #expect(cue.playbackFrame(sceneSeconds: 2, rate: rate, voiceAdvanceMs: 0) == 0)
    #expect(cue.playbackFrame(sceneSeconds: 1.5, rate: rate, voiceAdvanceMs: 500) == 0)
    #expect(cue.playbackFrame(sceneSeconds: 2.5, rate: rate, voiceAdvanceMs: -500) == 0)
    #expect(cue.playbackFrame(sceneSeconds: 7.5, rate: rate, voiceAdvanceMs: 500) == 144)
    #expect(cue.playbackFrame(sceneSeconds: 8.5, rate: rate, voiceAdvanceMs: -500) == 144)
    #expect(cue.playbackFrame(sceneSeconds: 1, rate: rate, voiceAdvanceMs: 500, speed: 2) == 0)
}

@Test func echoMixRemainsCompatibleWithExistingProjects() throws {
    let old = "{\"level\":0.8,\"lowPassHz\":18000,\"delayMs\":280,\"feedback\":0.2,\"reverbWet\":0,\"distortion\":0,\"pan\":0}"
    var effect = try JSONDecoder().decode(EffectSettings.self, from: Data(old.utf8))
    #expect(effect[.delayWet] == 0.3)
    effect[.delayWet] = 0.75
    let restored = try JSONDecoder().decode(EffectSettings.self, from: JSONEncoder().encode(effect))
    #expect(restored[.delayWet] == 0.75)
    var project = Project.starter
    project.scenes[3].cues[0].effects[.delayWet] = 1.1
    #expect(project.validation().contains { $0.contains("delayWet") })
}

@Test func recordingModesAndRepeatsPreserveLegacyProjects() throws {
    let legacy = try JSONDecoder().decode(CaptureCue.self, from: Data("{\"trigger\":\"gate\",\"startFrame\":0,\"durationSeconds\":6}".utf8))
    #expect(legacy.recordingMode == .timed)
    var p = Project.starter
    p.scenes[0].capture?.mode = .manual
    p.scenes[0].capture?.gateFrame = 24
    p.scenes[0].cues = [VoiceCue(startFrame: 48, lengthFrames: 240)]
    p.scenes[0].cues[0].loopToFill = true
    let decoded = try JSONDecoder().decode(Project.self, from: JSONEncoder().encode(p))
    #expect(decoded == p)
    #expect(decoded.validation().isEmpty)
    p.scenes[0].capture?.trigger = .automatic
    #expect(p.validation().contains { $0.contains("manual recording requires a consent gate") })
    p.scenes[0].capture?.trigger = .gate
    p.scenes[0].cues[0].startFrame = 12
    #expect(p.validation().contains { $0.contains("completed recording before playback") })
    p.scenes[0].cues[0].repeatCount = 101
    #expect(p.validation().contains { $0.contains("repeat count") })
}
