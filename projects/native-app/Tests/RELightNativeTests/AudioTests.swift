import AVFoundation
import Foundation
import Testing
@testable import RELightMac
import RELightCore

@MainActor @Test func nativeCaptureConvertsAndDisposesPCM() throws {
    let audio = NativeAudio()
    let format = AVAudioFormat(standardFormatWithSampleRate: 32000, channels: 1)!
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 32000)!
    buffer.frameLength = 32000
    for i in 0..<32000 { buffer.floatChannelData![0][i] = Float(sin(Double(i) * .pi * 2 * 440 / 32000) * 0.1) }
    // Synthetic fixture proves conversion/cleanup, never physical microphone readiness.
    audio.store.begin(seconds: 1, sampleRate: 32000); audio.store.consume(buffer)
    #expect(audio.store.finished)
    try audio.finishCapture()
    #expect(audio.take?.format.sampleRate == 48000)
    #expect(abs(audio.takeSeconds - 1) < 0.02)
    audio.clearTake()
    #expect(audio.take == nil)
    #expect(audio.takeSeconds == 0)
}

@MainActor @Test func silenceIsNotAUsableRecording() {
    let audio = NativeAudio(), format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2)!
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 48000)!
    buffer.frameLength = 48000
    for c in 0..<2 { for i in 0..<48000 { buffer.floatChannelData![c][i] = 0 } }
    audio.store.begin(seconds: 1, sampleRate: 48000); audio.store.consume(buffer)
    #expect(throws: (any Error).self) { try audio.finishCapture() }
    #expect(audio.take == nil)
}

@MainActor private func render(_ effect: EffectSettings, bypass: Bool = false) throws -> [Float] {
    let audio = NativeAudio(), format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2)!
    try audio.configure(input: "", output: "")
    try audio.engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 1024)
    var cue = VoiceCue(lengthFrames: 48); cue.effects = effect; cue.bypass = bypass; cue.fadeInFrames = 0; cue.fadeOutFrames = 0
    audio.apply(cue, localFrame: 1, bus: 0.8)
    let source = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 48000)!
    source.frameLength = 48000
    for c in 0..<2 { for i in 0..<48000 { source.floatChannelData![c][i] = i < 4000 ? Float(sin(Double(i) * .pi * 2 * 440 / 48000) * 0.1) : 0 } }
    audio.voice.scheduleBuffer(source); try audio.engine.start(); audio.voice.play()
    var result: [Float] = []
    let rendered = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 1024)!
    for _ in 0..<60 {
        let status = try audio.engine.renderOffline(1024, to: rendered)
        if status == .success { result.append(contentsOf: UnsafeBufferPointer(start: rendered.floatChannelData![0], count: Int(rendered.frameLength))) }
    }
    audio.stopAll(); audio.engine.disableManualRenderingMode()
    return result
}

@MainActor @Test func nativeEffectsRenderAudioAndBoundFeedback() throws {
    let clean = try render(.preset("Clean")), echo = try render(.preset("Echo")), distorted = try render(.preset("Distorted"))
    #expect(clean.count > 48000 && echo.count > 48000)
    #expect(clean.allSatisfy { $0.isFinite && abs($0) <= 1 })
    #expect(echo.allSatisfy { $0.isFinite && abs($0) <= 1 })
    let rms: ([Float]) -> Double = { a in sqrt(a.reduce(0) { $0 + Double($1 * $1) } / Double(max(1, a.count))) }
    #expect(rms(clean) > 0.001)
    #expect(rms(Array(echo[14000..<24000])) > rms(Array(clean[14000..<24000])) + 0.0001)
    #expect(zip(clean, distorted).contains { abs($0 - $1) > 0.001 })
}

@MainActor @Test func disconnectedNamedRouteFailsInsteadOfFallingBack() {
    let audio = NativeAudio()
    #expect(throws: (any Error).self) { try audio.configure(input: "not-a-real-microphone", output: "") }
    // Correcting a missing route must recover on this same engine instance.
    #expect(throws: Never.self) { try audio.configure(input: "", output: "") }
    audio.stopAll()
}

@MainActor @Test func nativeCanRouteTheInstalledMacDevices() throws {
    let devices = DeviceCatalog.devices()
    guard let input = devices.first(where: { $0.input && $0.uid.lowercased().contains("builtin") }), let output = devices.first(where: { $0.output && $0.uid.lowercased().contains("builtin") }) else { return }
    let audio = NativeAudio()
    try audio.configure(input: input.uid, output: output.uid)
    #expect(audio.engine.outputNode.auAudioUnit.deviceID == output.id)
    audio.stopAll()
}

@MainActor @Test func bypassPreservesMixAndRemovesCreativeProcessing() throws {
    var neutral = EffectSettings(); neutral.level = 0.25; neutral.pan = -0.2
    var filtered = neutral; filtered.lowPassHz = 120; filtered.delayMs = 280
    filtered.feedback = 0.3; filtered.distortion = 0.5; filtered.reverbWet = 0.5
    let reference = try render(neutral, bypass: true)
    let dry = try render(filtered, bypass: true)
    let processed = try render(filtered)
    #expect(reference.count == dry.count)
    // Rendered bypass must match the same level/pan with no creative effects,
    // rather than resetting to a default mix or retaining a filter.
    let difference = zip(reference, dry).reduce(0.0) { $0 + Double(abs($1.0 - $1.1)) } / Double(dry.count)
    #expect(difference < 0.00001)
    #expect(zip(dry, processed).contains { abs($0 - $1) > 0.001 })
    #expect(dry.allSatisfy { $0.isFinite && abs($0) <= 1 })
}

@MainActor @Test func resumedVoicePreservesSampleFadesAndSourcePosition() throws {
    let audio = NativeAudio()
    let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    let input = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 96000)!
    input.frameLength = 96000
    for i in 0..<96000 { input.floatChannelData![0][i] = 0.1 }
    audio.store.begin(seconds: 2, sampleRate: 48000); audio.store.consume(input)
    try audio.finishCapture()
    var cue = VoiceCue(lengthFrames: 24)
    cue.sourceInFrame = 6; cue.fadeInFrames = 12; cue.fadeOutFrames = 12
    let original = try audio.preparedBuffer(for: cue, rate: FrameRate())
    let resumed = try audio.preparedBuffer(for: cue, rate: FrameRate(), offsetFrames: 3)
    #expect(original.frameLength == 48000)
    #expect(resumed.frameLength == 42000)
    // At 0.125s of a 0.5s fade, gain is 25%; resuming must not restart that fade.
    #expect(abs(original.floatChannelData![0][6000] - 0.025) < 0.00001)
    #expect(abs(resumed.floatChannelData![0][0] - 0.025) < 0.00001)
    for c in 0..<2 {
        #expect((0..<42000).allSatisfy { abs(resumed.floatChannelData![c][$0] - original.floatChannelData![c][$0 + 6000]) < 0.000001 })
    }
    #expect(throws: (any Error).self) { try audio.preparedBuffer(for: cue, rate: FrameRate(), offsetFrames: 24) }
    audio.clearTake()
}

@MainActor @Test func shortTakeCanRepeatOrFillLongRegionAndResumeInsideLoop() throws {
    let audio = NativeAudio()
    defer { audio.stopAll() }
    let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    let input = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 144000)!
    input.frameLength = 144000
    for i in 0..<144000 { input.floatChannelData![0][i] = 0.01 + Float(i) / 144000 * 0.05 }
    audio.store.begin(seconds: 3, sampleRate: 48000); audio.store.consume(input); try audio.finishCapture()
    var cue = VoiceCue(lengthFrames: 240)
    cue.fadeInFrames = 0; cue.fadeOutFrames = 0
    #expect(try audio.preparedBuffer(for: cue, rate: FrameRate()).frameLength == 144000)
    cue.repeatCount = 3
    #expect(try audio.preparedBuffer(for: cue, rate: FrameRate()).frameLength == 432000)
    cue.loopToFill = true
    let full = try audio.preparedBuffer(for: cue, rate: FrameRate())
    #expect(full.frameLength == 480000)
    #expect(abs(full.floatChannelData![0][145000] - full.floatChannelData![0][1000]) < 0.000001)
    let resumed = try audio.preparedBuffer(for: cue, rate: FrameRate(), offsetFrames: 96)
    #expect(resumed.frameLength == 288000)
    for channel in 0..<2 {
        for i in 0..<288000 { #expect(resumed.floatChannelData![channel][i] == full.floatChannelData![channel][192000 + i]) }
    }
}
