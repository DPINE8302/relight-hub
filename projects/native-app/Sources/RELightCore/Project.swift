import Foundation

public struct FrameRate: Codable, Equatable, Sendable {
    public var numerator: Int = 24
    public var denominator: Int = 1
    public init(numerator: Int = 24, denominator: Int = 1) { self.numerator = numerator; self.denominator = denominator }
    public var fps: Double { Double(numerator) / Double(max(1, denominator)) }
    public func seconds(_ frame: Int) -> Double { Double(frame) / fps }
    public func frame(_ seconds: Double) -> Int { Int((seconds * fps + 0.0000001).rounded(.down)) }
    public func timecode(_ frame: Int) -> String {
        let rate = max(1, Int(fps.rounded())), f = max(0, frame)
        return String(format: "%02d:%02d:%02d:%02d", f / (rate * 3600), f / (rate * 60) % 60, f / rate % 60, f % rate)
    }
}

public struct AutomationPoint: Codable, Identifiable, Equatable, Sendable {
    public var id = UUID()
    public var frame: Int
    public var value: Double
    public init(frame: Int, value: Double) { self.frame = frame; self.value = value }
}

public enum EffectParameter: String, Codable, CaseIterable, Sendable { case level, lowPassHz, delayMs, delayWet, feedback, reverbWet, distortion, pan }

public struct EffectSettings: Codable, Equatable, Sendable {
    public var level: Double = 0.8
    public var lowPassHz: Double = 18000
    public var delayMs: Double = 0
    // Optional on disk so existing schema-1 projects retain their original 30% echo mix.
    public var delayWet: Double?
    public var feedback: Double = 0
    public var reverbWet: Double = 0
    public var distortion: Double = 0
    public var pan: Double = 0
    public init() {}
    public static func preset(_ name: String) -> EffectSettings {
        var e = EffectSettings()
        switch name {
        case "Echo": e.delayMs = 280; e.feedback = 0.22; e.reverbWet = 0.18; e.lowPassHz = 5200
        case "Decay": e.delayMs = 320; e.feedback = 0.30; e.reverbWet = 0.35; e.lowPassHz = 2400
        case "Distorted": e.delayMs = 210; e.feedback = 0.16; e.distortion = 0.25; e.lowPassHz = 2400
        default: break
        }
        return e
    }
    public subscript(_ p: EffectParameter) -> Double {
        get { switch p { case .level: level; case .lowPassHz: lowPassHz; case .delayMs: delayMs; case .delayWet: delayWet ?? 0.3; case .feedback: feedback; case .reverbWet: reverbWet; case .distortion: distortion; case .pan: pan } }
        set { switch p { case .level: level = newValue; case .lowPassHz: lowPassHz = newValue; case .delayMs: delayMs = newValue; case .delayWet: delayWet = newValue; case .feedback: feedback = newValue; case .reverbWet: reverbWet = newValue; case .distortion: distortion = newValue; case .pan: pan = newValue } }
    }
    public static func range(_ p: EffectParameter) -> ClosedRange<Double> {
        switch p { case .level, .delayWet, .reverbWet, .distortion: 0...1; case .lowPassHz: 120...20000; case .delayMs: 0...2000; case .feedback: 0...0.38; case .pan: -1...1 }
    }
}

public struct VoiceCue: Codable, Identifiable, Equatable, Sendable {
    public var id = UUID()
    public var name = "Visitor voice"
    public var startFrame: Int = 0
    public var lengthFrames: Int = 144
    public var sourceInFrame: Int = 0
    public var fadeInFrames: Int = 2
    public var fadeOutFrames: Int = 6
    public var bypass = false
    public var repeatCount: Int?
    public var loopToFill: Bool?
    public var repeatsSource: Bool { loopToFill == true || (repeatCount ?? 1) > 1 }
    public var effects = EffectSettings()
    public var automation: [String: [AutomationPoint]] = [:]
    public init(startFrame: Int = 0, lengthFrames: Int = 144) { self.startFrame = startFrame; self.lengthFrames = lengthFrames }
    public func value(_ p: EffectParameter, at frame: Int) -> Double {
        let points = (automation[p.rawValue] ?? []).sorted { $0.frame < $1.frame }
        guard let first = points.first else { return effects[p] }
        if frame <= first.frame { return first.value }
        for pair in zip(points, points.dropFirst()) where frame <= pair.1.frame {
            let distance = max(1, pair.1.frame - pair.0.frame)
            let t = Double(frame - pair.0.frame) / Double(distance)
            return pair.0.value + (pair.1.value - pair.0.value) * t
        }
        return points.last!.value
    }
    public func playbackFrame(sceneSeconds: Double, rate: FrameRate, voiceAdvanceMs: Double, speed: Double = 1) -> Int {
        rate.frame(sceneSeconds - rate.seconds(startFrame) + voiceAdvanceMs / 1000 * speed)
    }
    public func envelope(at frame: Int) -> Double {
        guard frame >= 0, frame < lengthFrames else { return 0 }
        let fadeIn = fadeInFrames > 0 ? min(1, Double(frame) / Double(fadeInFrames)) : 1
        let fadeOut = fadeOutFrames > 0 ? min(1, Double(lengthFrames - frame) / Double(fadeOutFrames)) : 1
        return min(fadeIn, fadeOut)
    }
}

public struct CaptureCue: Codable, Equatable, Sendable {
    public enum Trigger: String, Codable, CaseIterable, Sendable { case gate, automatic }
    public enum Mode: String, Codable, CaseIterable, Sendable { case timed, manual }
    public var mode: Mode?
    public var gateFrame: Int?
    public var recordingMode: Mode { mode ?? .timed }
    public static let manualLimitSeconds: Double = 600
    public var trigger: Trigger = .gate
    public var startFrame: Int = 0
    public var durationSeconds: Double = 6
    public init(trigger: Trigger = .gate, startFrame: Int = 0, durationSeconds: Double = 6) {
        self.trigger = trigger; self.startFrame = startFrame; self.durationSeconds = durationSeconds
    }
}

public struct Scene: Codable, Identifiable, Equatable, Sendable {
    public var id = UUID()
    public var name: String
    public var thai: String
    public var frames: Int
    public var media: String?
    public var mediaInFrame: Int = 0
    public var draft = true
    public var capture: CaptureCue?
    public var cues: [VoiceCue] = []
    public init(name: String, thai: String, frames: Int, media: String? = nil, capture: CaptureCue? = nil, cues: [VoiceCue] = []) {
        self.name = name; self.thai = thai; self.frames = frames; self.media = media; self.capture = capture; self.cues = cues
    }
}

public struct Project: Codable, Equatable, Sendable {
    public var schemaVersion = 1
    public var title = "RE:Light"
    public var rate = FrameRate()
    public var filmLevel: Double = 0.75
    public var voiceLevel: Double = 0.85
    public var duckLevel: Double = 0.35
    public var outputOffsetMs: Double = 0
    public var effectPresets: [String: EffectSettings] = [:]
    public var blackFromFrame: Int? = 2808
    public var scenes: [Scene] = []
    public init() {}
    public var totalFrames: Int { scenes.reduce(0) { $0 + $1.frames } }
    public func globalFrame(scene: Int, localFrame: Int) -> Int { scenes.prefix(scene).reduce(0) { $0 + $1.frames } + localFrame }
    public static var starter: Project {
        var p = Project()
        p.scenes = [
            Scene(name: "Memory", thai: "ความทรงจำ", frames: 432, media: "media/Scene01_Draft1_480p_v5.mp4", capture: CaptureCue()),
            Scene(name: "Possibility", thai: "ความเป็นไปได้", frames: 648),
            Scene(name: "The Choice", thai: "ทางเลือก", frames: 528),
            Scene(name: "Narrowing World / Hospital", thai: "โลกแคบลง", frames: 936, cues: [VoiceCue(startFrame: 744, lengthFrames: 192)]),
            Scene(name: "Wake", thai: "ตื่น", frames: 336)
        ]
        return p
    }
    public func validation() -> [String] {
        var issues: [String] = []
        if schemaVersion != 1 { issues.append("Unsupported project version") }
        if rate.numerator < 1 || rate.numerator > 240000 || rate.denominator < 1 || rate.denominator > 10000 || rate.fps > 240 || rate.fps < 1 { issues.append("Frame rate must be between 1 and 240 fps") }
        if scenes.isEmpty || scenes.count > 100 { issues.append("A project needs 1–100 scenes") }
        if Set(scenes.map(\.id)).count != scenes.count { issues.append("Scene identifiers must be unique") }
        if !filmLevel.isFinite || !(0...1).contains(filmLevel) || !voiceLevel.isFinite || !(0...1).contains(voiceLevel) || !duckLevel.isFinite || !(0...1).contains(duckLevel) { issues.append("Mixer levels must be between 0 and 1") }
        if !outputOffsetMs.isFinite || !(-1000...1000).contains(outputOffsetMs) { issues.append("Output offset must be between −1000 and 1000 ms") }
        guard scenes.count <= 100, scenes.allSatisfy({ (1...1_000_000).contains($0.frames) && (0...1_000_000).contains($0.mediaInFrame) }) else { return issues + ["Scene duration or media in-point exceeds supported limits"] }
        guard scenes.allSatisfy({ $0.cues.count <= 100 && $0.cues.allSatisfy({ (0...1_000_000).contains($0.startFrame) && (1...1_000_000).contains($0.lengthFrames) && (0...1_000_000).contains($0.sourceInFrame) && (0...1_000_000).contains($0.fadeInFrames) && (0...1_000_000).contains($0.fadeOutFrames) }) }) else { return issues + ["Voice region or trim exceeds supported limits"] }
        if let blackFromFrame, blackFromFrame < 0 || blackFromFrame > totalFrames { issues.append("Ending black frame lies outside project") }
        var hasCapture = false
        for scene in scenes {
            if scene.frames <= 0 || scene.frames > 1_000_000 || scene.mediaInFrame < 0 { issues.append("\(scene.name): invalid duration or media in-point") }
            if let path = scene.media, !Self.safeRelativePath(path) { issues.append("\(scene.name): asset path must stay inside project") }
            if let capture = scene.capture {
                if !capture.durationSeconds.isFinite || !(1...60).contains(capture.durationSeconds) { issues.append("\(scene.name): recording duration must be 1–60 seconds") }
                if let gate = capture.gateFrame, (capture.trigger != .gate || gate < 0 || gate >= scene.frames) { issues.append("\(scene.name): recording gate frame must be inside the scene") }
                if capture.recordingMode == .manual && capture.trigger != .gate { issues.append("\(scene.name): manual recording requires a consent gate") }
                if capture.trigger == .automatic && (capture.startFrame < 0 || capture.startFrame >= scene.frames || Double(capture.startFrame) + capture.durationSeconds * rate.fps > Double(scene.frames)) { issues.append("\(scene.name): recording window exceeds scene") }
            }
            let ids = scene.cues.map(\.id)
            if Set(ids).count != ids.count { issues.append("\(scene.name): cue identifiers must be unique") }
            let sorted = scene.cues.sorted { $0.startFrame < $1.startFrame }
            for (i, cue) in sorted.enumerated() {
                if let count = cue.repeatCount, !(1...100).contains(count) { issues.append("\(scene.name): repeat count must be 1–100") }
                if cue.repeatsSource && rate.seconds(cue.lengthFrames) > CaptureCue.manualLimitSeconds { issues.append("\(scene.name): repeated voice regions must be at most 10 minutes") }
                if cue.startFrame < 0 || cue.lengthFrames <= 0 || cue.startFrame + cue.lengthFrames > scene.frames || cue.sourceInFrame < 0 || cue.fadeInFrames < 0 || cue.fadeOutFrames < 0 { issues.append("\(scene.name): voice cue exceeds scene or has invalid trim/fade") }
                if !hasCapture && !(scene.capture?.trigger == .gate && scene.capture?.gateFrame != nil && cue.startFrame > scene.capture!.gateFrame!) && !(scene.capture?.trigger == .automatic && Double(cue.startFrame) >= Double(scene.capture!.startFrame) + scene.capture!.durationSeconds * rate.fps + rate.fps * 0.1) { issues.append("\(scene.name): voice needs a completed recording before playback") }
                if i > 0 && sorted[i - 1].startFrame + sorted[i - 1].lengthFrames > cue.startFrame { issues.append("\(scene.name): visitor voice cues cannot overlap") }
                for param in EffectParameter.allCases {
                    if !cue.effects[param].isFinite || !EffectSettings.range(param).contains(cue.effects[param]) { issues.append("\(scene.name): invalid \(param.rawValue)") }
                }
                for (key, points) in cue.automation {
                    guard let param = EffectParameter(rawValue: key) else { issues.append("Unknown automation parameter \(key)"); continue }
                    if Set(points.map(\.frame)).count != points.count || points.contains(where: { $0.frame < 0 || $0.frame > cue.lengthFrames || !$0.value.isFinite || !EffectSettings.range(param).contains($0.value) }) { issues.append("\(scene.name): invalid automation points") }
                }
            }
            if scene.capture != nil { hasCapture = true }
        }
        return issues
    }
    public static func safeRelativePath(_ path: String) -> Bool {
        !path.isEmpty && !path.hasPrefix("/") && !path.contains(":") && !path.contains("\\") && !path.split(separator: "/").contains("..")
    }
    public func assetURL(_ path: String, root: URL) -> URL? {
        guard Self.safeRelativePath(path) else { return nil }
        let base = root.resolvingSymlinksInPath().standardizedFileURL
        let candidate = base.appendingPathComponent(path).resolvingSymlinksInPath().standardizedFileURL
        return candidate.path.hasPrefix(base.path + "/") ? candidate : nil
    }
}

/// Same event semantics can be implemented by any future platform adapter.
public struct CueLedger: Sendable {
    private var fired = Set<UUID>()
    public init() {}
    public mutating func reset() { fired.removeAll() }
    public mutating func skip(through frame: Int, cues: [VoiceCue]) { for cue in cues where cue.startFrame <= frame { fired.insert(cue.id) } }
    public mutating func due(through frame: Int, cues: [VoiceCue]) -> [VoiceCue] {
        cues.filter { cue in
            guard cue.startFrame <= frame, !fired.contains(cue.id) else { return false }
            fired.insert(cue.id); return true
        }.sorted { $0.startFrame < $1.startFrame }
    }
}
