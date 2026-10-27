import AVFoundation
import AudioToolbox
import CoreAudio
import Foundation
import RELightCore

struct SoundDevice: Identifiable, Equatable, Sendable {
    let id: UInt32
    let uid: String
    let name: String
    let input: Bool
    let output: Bool
    var systemInput = false
    var systemOutput = false
}

enum DeviceCatalog {
    static func devices() -> [SoundDevice] { (try? discover()) ?? [] }
    static func discover() throws -> [SoundDevice] {
        var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size) == noErr else { throw AudioFailure("Audio device discovery did not respond. The previous selection is retained.") }
        var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &ids) == noErr else { throw AudioFailure("Audio device discovery failed. The previous selection is retained.") }
        let defaultInput = defaultDeviceID(kAudioHardwarePropertyDefaultInputDevice)
        let defaultOutput = defaultDeviceID(kAudioHardwarePropertyDefaultOutputDevice)
        return ids.compactMap { id in
            guard let uid = string(id, kAudioDevicePropertyDeviceUID), let name = string(id, kAudioObjectPropertyName) else { return nil }
            return SoundDevice(id: id, uid: uid, name: name, input: hasStreams(id, kAudioDevicePropertyScopeInput), output: hasStreams(id, kAudioDevicePropertyScopeOutput), systemInput: id == defaultInput, systemOutput: id == defaultOutput)
        }
    }
    static func defaultDeviceID(_ selector: AudioObjectPropertySelector) -> AudioDeviceID? {
        var address = AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var device = AudioDeviceID(0), size = UInt32(MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device) == noErr, device != 0 else { return nil }
        return device
    }
    static func string(_ id: UInt32, _ selector: AudioObjectPropertySelector) -> String? {
        var a = AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        let pointer = UnsafeMutablePointer<CFString?>.allocate(capacity: 1)
        pointer.initialize(to: nil)
        defer { pointer.deinitialize(count: 1); pointer.deallocate() }
        var size = UInt32(MemoryLayout<CFString?>.size)
        guard AudioObjectGetPropertyData(id, &a, 0, nil, &size, pointer) == noErr else { return nil }
        return pointer.pointee as String?
    }
    static func hasStreams(_ id: UInt32, _ scope: AudioObjectPropertyScope) -> Bool {
        var a = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreams, mScope: scope, mElement: kAudioObjectPropertyElementMain)
        var size: UInt32 = 0
        return AudioObjectGetPropertyDataSize(id, &a, 0, nil, &size) == noErr && size > 0
    }
}

/// The audio callback never retains a visitor recording beyond this session store.
final class CaptureStore: @unchecked Sendable {
    private let lock = NSLock()
    private var samples: [Float] = []
    private var recording = false
    private var maximum = 0
    private var rate: Double = 48000
    private var levelValue: Float = 0
    private var peakValue: Float = 0
    func consume(_ buffer: AVAudioPCMBuffer) {
        guard let channels = buffer.floatChannelData else { return }
        lock.lock(); defer { lock.unlock() }
        let count = Int(buffer.frameLength), channelCount = Int(buffer.format.channelCount)
        var sum: Float = 0, peak: Float = 0
        for i in 0..<count {
            var sample: Float = 0
            for c in 0..<channelCount { sample += channels[c][i] }
            sample /= Float(channelCount)
            sum += sample * sample; peak = max(peak, abs(sample))
            if recording && samples.count < maximum { samples.append(sample) }
        }
        levelValue = count > 0 ? sqrt(sum / Float(count)) : 0; peakValue = peak
        if samples.count >= maximum { recording = false }
    }
    func begin(seconds: Double, sampleRate: Double) {
        lock.lock(); defer { lock.unlock() }
        samples.removeAll(keepingCapacity: false); rate = sampleRate
        maximum = Int(seconds * rate); samples.reserveCapacity(min(maximum, Int(6 * rate))); recording = true
    }
    func finish() -> (samples: [Float], rate: Double) {
        lock.lock(); defer { lock.unlock() }; recording = false
        let result = (samples, rate); samples.removeAll(keepingCapacity: false); return result
    }
    func clear() { lock.lock(); defer { lock.unlock() }; recording = false; samples = []; levelValue = 0; peakValue = 0 }
    var meter: (rms: Float, peak: Float) { lock.lock(); defer { lock.unlock() }; return (levelValue, peakValue) }
    var finished: Bool { lock.lock(); defer { lock.unlock() }; return !recording && maximum > 0 && samples.count >= maximum }
}

/// Independent input queue permits a microphone and speakers on different devices.
final class MicrophoneCapture {
    private var queue: AudioQueueRef?
    private let store: CaptureStore
    init(store: CaptureStore) { self.store = store }
    func start(uid: String) throws {
        stop()
        var description = AudioStreamBasicDescription(mSampleRate: 48000, mFormatID: kAudioFormatLinearPCM, mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked, mBytesPerPacket: 4, mFramesPerPacket: 1, mBytesPerFrame: 4, mChannelsPerFrame: 1, mBitsPerChannel: 32, mReserved: 0)
        var created: AudioQueueRef?
        let status = AudioQueueNewInput(&description, { context, queue, buffer, _, _, _ in
            guard let context else { return }
            let store = Unmanaged<CaptureStore>.fromOpaque(context).takeUnretainedValue()
            let frames = buffer.pointee.mAudioDataByteSize / 4
            if frames > 0, let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1), let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) {
                pcm.frameLength = frames
                pcm.floatChannelData![0].update(from: buffer.pointee.mAudioData.assumingMemoryBound(to: Float.self), count: Int(frames))
                store.consume(pcm)
            }
            AudioQueueEnqueueBuffer(queue, buffer, 0, nil)
        }, Unmanaged.passUnretained(store).toOpaque(), nil, nil, 0, &created)
        guard status == noErr, let created else { throw AudioFailure("Cannot create microphone capture (\(status))") }
        queue = created
        do {
            if !uid.isEmpty {
                let deviceUID = UnsafeMutablePointer<CFString>.allocate(capacity: 1)
                deviceUID.initialize(to: uid as CFString)
                defer { deviceUID.deinitialize(count: 1); deviceUID.deallocate() }
                let routed = AudioQueueSetProperty(created, kAudioQueueProperty_CurrentDevice, deviceUID, UInt32(MemoryLayout<CFString>.size))
                guard routed == noErr else { throw AudioFailure("Cannot select microphone (\(routed))") }
            }
            for _ in 0..<3 {
                var buffer: AudioQueueBufferRef?
                let allocated = AudioQueueAllocateBuffer(created, 4096, &buffer)
                guard allocated == noErr, let buffer else { throw AudioFailure("Cannot allocate microphone buffer (\(allocated))") }
                let queued = AudioQueueEnqueueBuffer(created, buffer, 0, nil)
                guard queued == noErr else { throw AudioFailure("Cannot prepare microphone buffer (\(queued))") }
            }
            let started = AudioQueueStart(created, nil)
            guard started == noErr else { throw AudioFailure("Cannot start microphone (\(started))") }
        } catch { stop(); throw error }
    }
    func stop() {
        if let queue { AudioQueueStop(queue, true); AudioQueueDispose(queue, true); self.queue = nil }
    }
    deinit { stop() }
}

@MainActor final class NativeAudio {
    let engine = AVAudioEngine()
    let voice = AVAudioPlayerNode()
    let timePitch = AVAudioUnitTimePitch()
    let equalizer = AVAudioUnitEQ(numberOfBands: 1)
    let delay = AVAudioUnitDelay()
    let reverb = AVAudioUnitReverb()
    let distortion = AVAudioUnitDistortion()
    let limiter: AVAudioUnitEffect
    let store = CaptureStore()
    private(set) var take: AVAudioPCMBuffer?
    private(set) var takeSeconds: Double = 0
    private(set) var inputRate: Double = 48000
    private var tapInstalled = false
    private lazy var microphone = MicrophoneCapture(store: store)
    private var configured = false
    private var graphAttached = false
    private var inputUID = "", outputUID = ""
    private var inputRouteKey = "", outputRouteKey = ""
    var hasConfiguration: Bool { configured }
    var configuredInputUID: String { inputUID }
    var configuredOutputUID: String { outputUID }
    private var playbackGeneration = 0
    private var voiceEnd: DispatchWorkItem?
    private let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2)!
    var onVoiceEnded: (() -> Void)?

    init() {
        limiter = AVAudioUnitEffect(audioComponentDescription: AudioComponentDescription(componentType: kAudioUnitType_Effect, componentSubType: kAudioUnitSubType_DynamicsProcessor, componentManufacturer: kAudioUnitManufacturer_Apple, componentFlags: 0, componentFlagsMask: 0))
    }
    func configure(input: String, output: String, inventory: [SoundDevice], validateInput: Bool = true, preserveTake: Bool = false) throws {
        let available = inventory
        if validateInput && !input.isEmpty && !available.contains(where: { $0.uid == input && $0.input }) { throw AudioFailure("Selected microphone is disconnected. Choose a connected input in Devices.") }
        if !output.isEmpty && !available.contains(where: { $0.uid == output && $0.output }) { throw AudioFailure("Selected speakers are disconnected. Choose a connected output in Devices.") }
        let defaultInput = input.isEmpty ? (available.first(where: \.systemInput)?.id ?? 0) : 0
        let defaultOutput = output.isEmpty ? (available.first(where: \.systemOutput)?.id ?? 0) : 0
        if validateInput && input.isEmpty && defaultInput == 0 { throw AudioFailure("System microphone is unavailable") }
        if output.isEmpty && defaultOutput == 0 { throw AudioFailure("System output is unavailable") }
        let inputKey = input.isEmpty ? "system:\(available.first(where: \.systemInput)?.uid ?? ""):\(defaultInput)" : input
        let outputKey = output.isEmpty ? "system:\(available.first(where: \.systemOutput)?.uid ?? ""):\(defaultOutput)" : output
        if configured && inputRouteKey == inputKey && outputRouteKey == outputKey { return }
        let retainedTake = preserveTake ? take : nil, retainedSeconds = preserveTake ? takeSeconds : 0
        defer { if preserveTake { take = retainedTake; takeSeconds = retainedSeconds } }
        stopAll(); releaseMicrophone(); engine.stop()
        if graphAttached { for node in [voice, timePitch, equalizer, delay, reverb, distortion, limiter] as [AVAudioNode] { engine.detach(node) } }
        configured = false; graphAttached = false
        for node in [voice, timePitch, equalizer, delay, reverb, distortion, limiter] as [AVAudioNode] { engine.attach(node) }
        graphAttached = true
        engine.connect(voice, to: timePitch, format: format)
        engine.connect(timePitch, to: equalizer, format: format)
        engine.connect(equalizer, to: distortion, format: format)
        engine.connect(distortion, to: delay, format: format)
        engine.connect(delay, to: reverb, format: format)
        engine.connect(reverb, to: limiter, format: format)
        engine.connect(limiter, to: engine.mainMixerNode, format: format)
        equalizer.bands[0].filterType = .lowPass; equalizer.bands[0].bypass = false
        reverb.loadFactoryPreset(.mediumRoom); distortion.loadFactoryPreset(.speechRadioTower)
        AudioUnitSetParameter(limiter.audioUnit, kDynamicsProcessorParam_Threshold, kAudioUnitScope_Global, 0, -5, 0)
        AudioUnitSetParameter(limiter.audioUnit, kDynamicsProcessorParam_HeadRoom, kAudioUnitScope_Global, 0, 5, 0)
        if !output.isEmpty {
            guard let device = available.first(where: { $0.uid == output && $0.output }) else { throw AudioFailure("Selected speakers are disconnected") }
            do { try engine.outputNode.auAudioUnit.setDeviceID(device.id) } catch { throw AudioFailure("Native output routing failed for \(device.name): \(error.localizedDescription)") }
        } else {
            do { try engine.outputNode.auAudioUnit.setDeviceID(defaultOutput) } catch { throw AudioFailure("Cannot restore system output: \(error.localizedDescription)") }
        }
        inputUID = input.isEmpty ? (available.first(where: \.systemInput)?.uid ?? "") : input
        outputUID = output.isEmpty ? (available.first(where: \.systemOutput)?.uid ?? "") : output
        inputRouteKey = inputKey; outputRouteKey = outputKey; configured = true
    }
    func startEngine() throws { if !engine.isRunning { try engine.start() } }
    func prepareMicrophone() throws {
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else { throw AudioFailure("Allow microphone access in Devices") }
        if tapInstalled { return }
        try microphone.start(uid: inputUID)
        inputRate = 48000
        tapInstalled = true
    }
    func releaseMicrophone() { microphone.stop(); tapInstalled = false; store.clear() }
    func beginCapture(seconds: Double) throws {
        try prepareMicrophone(); clearTake(); store.begin(seconds: seconds, sampleRate: inputRate)
    }
    func finishCapture(boostLimit: Double = 1) throws {
        let result = store.finish()
        guard boostLimit.isFinite, (1...400).contains(boostLimit) else { clearTake(); throw AudioFailure("Dream recording boost must be between 1 and 400.") }
        guard !result.samples.isEmpty else { throw AudioFailure("No recording was captured. Continuing without voice (DREAM-00).") }
        let rms = sqrt(result.samples.reduce(Double(0)) { $0 + Double($1 * $1) } / Double(result.samples.count))
        guard rms.isFinite, rms > 0.001 / boostLimit else { clearTake(); throw AudioFailure("Recording was silent. Continuing without voice (DREAM-00).") }
        let inputFormat = AVAudioFormat(standardFormatWithSampleRate: result.rate, channels: 1)!
        let original = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: AVAudioFrameCount(result.samples.count))!
        original.frameLength = original.frameCapacity
        result.samples.withUnsafeBufferPointer { original.floatChannelData![0].update(from: $0.baseAddress!, count: $0.count) }
        guard let converter = AVAudioConverter(from: inputFormat, to: format), let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(Double(result.samples.count) * 48000 / result.rate + 128)) else { throw AudioFailure("Recording conversion failed") }
        var provided = false, error: NSError?
        let status = converter.convert(to: output, error: &error) { _, inputStatus in
            if provided { inputStatus.pointee = .endOfStream; return nil }
            provided = true; inputStatus.pointee = .haveData; return original
        }
        guard error == nil && status != .error && output.frameLength > 0 else { throw AudioFailure("Recording conversion failed") }
        take = output; takeSeconds = Double(output.frameLength) / 48000
    }
    func apply(_ cue: VoiceCue, localFrame: Int, bus: Double) {
        var e = cue.effects
        for p in EffectParameter.allCases { e[p] = cue.value(p, at: localFrame) }
        // Bypass creative processing, not region level/pan, timing or the safety limiter.
        equalizer.bypass = cue.bypass
        delay.bypass = cue.bypass
        reverb.bypass = cue.bypass
        distortion.bypass = cue.bypass
        equalizer.bands[0].frequency = Float(e.lowPassHz)
        delay.delayTime = e.delayMs / 1000; delay.feedback = Float(e.feedback * 100); delay.wetDryMix = e.delayMs > 0 ? Float(e.delayWet ?? 0.3) * 100 : 0
        reverb.wetDryMix = Float(e.reverbWet * 100); distortion.wetDryMix = Float(e.distortion * 100)
        // Region fades are applied once in PCM by play(); gain automation must not fade them again.
        voice.volume = Float(e.level * bus); voice.pan = Float(e.pan)
    }
    func canResumeVoice(_ cue: VoiceCue, rate: FrameRate, offsetFrames: Int) -> Bool {
        guard let take, offsetFrames >= 0, offsetFrames < cue.lengthFrames else { return false }
        let sourceCount = Int(take.frameLength) - Int(rate.seconds(cue.sourceInFrame) * 48000)
        guard sourceCount > 0 else { return false }
        let regionCount = Int(rate.seconds(cue.lengthFrames) * 48000)
        let fullCount = cue.loopToFill == true ? regionCount : min(regionCount, sourceCount * (cue.repeatCount ?? 1))
        return Int(rate.seconds(offsetFrames) * 48000) < fullCount
    }
    func preparedBuffer(for cue: VoiceCue, rate: FrameRate, offsetFrames: Int = 0) throws -> AVAudioPCMBuffer {
        guard let take else { throw AudioFailure("No participant recording: DREAM-00, voice cue skipped") }
        guard offsetFrames >= 0, offsetFrames < cue.lengthFrames else { throw AudioFailure("Voice region has already ended") }
        let sourceOffset = Int(rate.seconds(cue.sourceInFrame) * 48000)
        let resumeOffset = Int(rate.seconds(offsetFrames) * 48000)
        let sourceCount = Int(take.frameLength) - sourceOffset
        guard sourceOffset >= 0, sourceCount > 0 else { throw AudioFailure("Voice trim is outside the captured recording") }
        guard cue.boostLimit.isFinite, (1...400).contains(cue.boostLimit) else { throw AudioFailure("Dream recording boost must be between 1 and 400.") }
        let regionCount = Int(rate.seconds(cue.lengthFrames) * 48000)
        let fullCount = cue.loopToFill == true ? regionCount : min(regionCount, sourceCount * (cue.repeatCount ?? 1))
        guard fullCount <= 48000 * 600 else { throw AudioFailure("Voice region exceeds the 10-minute memory limit") }
        let count = fullCount - resumeOffset
        guard sourceOffset >= 0, count > 0 else { throw AudioFailure("Voice trim is outside the captured recording") }
        // A single gain for the entire source preserves dynamics and stays identical
        // across repeats and pause/resume. Strong takes need less than the requested boost.
        var sourcePeak: Float = 0
        if cue.boostLimit > 1 {
            for channel in 0..<Int(format.channelCount) {
                for i in 0..<min(sourceCount, fullCount) {
                    sourcePeak = max(sourcePeak, abs(take.floatChannelData![channel][sourceOffset + i]))
                }
            }
        }
        let boost = cue.boostLimit > 1 && sourcePeak > 0 ? Float(min(cue.boostLimit, 0.9 / Double(sourcePeak))) : Float(1)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count))!
        buffer.frameLength = AVAudioFrameCount(count)
        let fadeIn = min(fullCount, Int(rate.seconds(cue.fadeInFrames) * 48000))
        let fadeOut = min(fullCount, Int(rate.seconds(cue.fadeOutFrames) * 48000))
        for channel in 0..<Int(format.channelCount) {
            if !cue.repeatsSource { buffer.floatChannelData![channel].update(from: take.floatChannelData![channel].advanced(by: sourceOffset + resumeOffset), count: count) }
            for i in 0..<count {
                let position = resumeOffset + i
                let incoming = fadeIn > 0 ? min(1, Float(position) / Float(fadeIn)) : 1
                let outgoing = fadeOut > 0 ? min(1, Float(fullCount - 1 - position) / Float(fadeOut)) : 1
                if cue.repeatsSource {
                    let loopPosition = position % sourceCount
                    let edge = min(240, sourceCount / 2)
                    let spliceIn = position >= sourceCount && edge > 0 ? min(1, Float(loopPosition) / Float(edge)) : 1
                    let spliceOut = position - loopPosition + sourceCount < fullCount && edge > 0 ? min(1, Float(sourceCount - 1 - loopPosition) / Float(edge)) : 1
                    buffer.floatChannelData![channel][i] = take.floatChannelData![channel][sourceOffset + loopPosition] * spliceIn * spliceOut
                }
                buffer.floatChannelData![channel][i] *= incoming * outgoing * boost
            }
        }
        return buffer
    }
    func play(_ cue: VoiceCue, rate: FrameRate, bus: Double, delaySeconds: Double = 0, speed: Double = 1, offsetFrames: Int = 0, completion: (() -> Void)? = nil) throws {
        let buffer = try preparedBuffer(for: cue, rate: rate, offsetFrames: offsetFrames)
        stopVoice(); try startEngine()
        timePitch.rate = Float(speed)
        apply(cue, localFrame: offsetFrames, bus: bus)
        playbackGeneration += 1; let generation = playbackGeneration
        let hostTime = mach_absolute_time() + AVAudioTime.hostTime(forSeconds: max(0, delaySeconds))
        voice.scheduleBuffer(buffer, at: AVAudioTime(hostTime: hostTime))
        voice.play()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.playbackGeneration == generation else { return }
            self.stopVoice(); completion?(); self.onVoiceEnded?()
        }
        voiceEnd = completion == nil ? nil : work
        // Effect tails are bounded by the cue region, including a shorter source.
        if completion != nil { DispatchQueue.main.asyncAfter(deadline: .now() + max(0, delaySeconds) + rate.seconds(cue.lengthFrames - offsetFrames) / speed, execute: work) }
    }
    func pause() { engine.pause() }
    func stopVoice() {
        playbackGeneration += 1; voiceEnd?.cancel(); voiceEnd = nil
        voice.stop(); delay.reset(); reverb.reset(); distortion.reset()
    }
    func clearTake() { stopVoice(); take = nil; takeSeconds = 0; store.clear() }
    func stopAll() { clearTake(); releaseMicrophone(); engine.stop() }
    func testTone() throws {
        try startEngine(); stopVoice()
        timePitch.rate = 1
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 24000)!
        buffer.frameLength = 24000
        for channel in 0..<Int(format.channelCount) { for i in 0..<24000 { buffer.floatChannelData![channel][i] = Float(sin(Double(i) * 2 * .pi * 440 / 48000) * 0.12 * min(1, Double(i) / 500) * min(1, Double(24000 - i) / 1000)) } }
        apply(VoiceCue(), localFrame: 10, bus: 0.5); voice.scheduleBuffer(buffer); voice.play()
    }
}

struct AudioFailure: LocalizedError { let message: String; init(_ message: String) { self.message = message }; var errorDescription: String? { message } }
