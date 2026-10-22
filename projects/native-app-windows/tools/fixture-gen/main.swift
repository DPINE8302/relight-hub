import Foundation

// Generates the Swift-authored conformance corpus for the Windows core.
// Usage: fixture-gen <native-app-dir> <output-dir>

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    fputs("usage: fixture-gen <native-app-dir> <output-dir>\n", stderr)
    exit(2)
}

let nativeApp = URL(fileURLWithPath: arguments[1])
let output = URL(fileURLWithPath: arguments[2])
let fileManager = FileManager.default

try? fileManager.removeItem(at: output)
try fileManager.createDirectory(at: output, withIntermediateDirectories: true)
let documents = output.appendingPathComponent("documents")
let invalidDocuments = documents.appendingPathComponent("invalid")
let legacy = output.appendingPathComponent("legacy")
try fileManager.createDirectory(at: documents, withIntermediateDirectories: true)
try fileManager.createDirectory(at: invalidDocuments, withIntermediateDirectories: true)
try fileManager.createDirectory(at: legacy, withIntermediateDirectories: true)

func prettyEncoded(_ project: Project) throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    return try encoder.encode(project)
}

func writeDocument(_ project: Project, _ name: String) throws {
    try prettyEncoded(project).write(to: documents.appendingPathComponent(name))
}

func issues(_ project: Project) -> [String] {
    project.validation().sorted()
}

func writeJSON(_ value: Any, _ name: String) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: output.appendingPathComponent(name))
}

var validation: [String: [String]] = [:]
var checks: [String: Any] = [:]

// MARK: - Bundled Draft 1 (the shape the Mac app actually ships)

let draftURL = nativeApp.appendingPathComponent("Resources/Examples/Draft1/experience.relight")
let draftData = try Data(contentsOf: draftURL)
let draft = try JSONDecoder().decode(Project.self, from: draftData)
try writeDocument(draft, "draft1.relight")
validation["draft1"] = issues(draft)
checks["draft1.totalFrames"] = draft.totalFrames
checks["draft1.rate.fps"] = draft.rate.fps
checks["draft1.globalFrame.3.384"] = draft.globalFrame(scene: 3, localFrame: 384)
checks["draft1.blackFromFrame"] = draft.blackFromFrame ?? -1

// MARK: - Fresh starter

let starter = Project.starter
try writeDocument(starter, "starter.relight")
validation["starter"] = issues(starter)
checks["starter.totalFrames"] = starter.totalFrames
checks["starter.seconds"] = starter.rate.seconds(starter.totalFrames)
checks["starter.cue.globalFrame"] = starter.globalFrame(
    scene: 3,
    localFrame: starter.scenes[3].cues[0].startFrame
)

// MARK: - Every optional field and every effect path present

var full = Project.starter
full.title = "Full fixture · ทดสอบ"
full.filmLevel = 0.7
full.voiceLevel = 0.9
full.duckLevel = 0.3
full.outputOffsetMs = 125.5
full.effectPresets["Custom"] = .preset("Echo")

var manual = full.scenes[0]
manual.capture?.mode = .manual
manual.capture?.gateFrame = 24
var rangeCue = VoiceCue(startFrame: 48, lengthFrames: 240)
rangeCue.repeatCount = 2
rangeCue.loopToFill = true
rangeCue.effects = .preset("Distorted")
rangeCue.effects[.delayWet] = 0.55
rangeCue.automation["level"] = [
    AutomationPoint(frame: 0, value: 0.8),
    AutomationPoint(frame: 192, value: 0.2)
]
rangeCue.automation["pan"] = [
    AutomationPoint(frame: 0, value: -0.5),
    AutomationPoint(frame: 240, value: 0.5)
]
manual.cues = [rangeCue]
full.scenes[0] = manual

full.scenes[3].cues[0].effects = .preset("Decay")
full.scenes[3].cues[0].automation["lowPassHz"] = [
    AutomationPoint(frame: 0, value: 18000),
    AutomationPoint(frame: 192, value: 2400)
]

let fullIssues = issues(full)
precondition(fullIssues.isEmpty, "full fixture must validate: \(fullIssues)")
try writeDocument(full, "full.relight")
validation["full"] = fullIssues
checks["full.totalFrames"] = full.totalFrames
checks["full.scene0.repeatCount"] = rangeCue.repeatCount ?? -1
checks["full.scene0.delayWet"] = rangeCue.effects[.delayWet]

// MARK: - Legacy payloads

let legacyEffectJSON = Data("{\"level\":0.8,\"lowPassHz\":18000,\"delayMs\":280,\"feedback\":0.2,\"reverbWet\":0,\"distortion\":0,\"pan\":0}".utf8)
try legacyEffectJSON.write(to: legacy.appendingPathComponent("effect-legacy.json"))
let legacyEffect = try JSONDecoder().decode(EffectSettings.self, from: legacyEffectJSON)
let compact = try JSONEncoder().encode(legacyEffect)
try compact.write(to: legacy.appendingPathComponent("effect-legacy-reencoded.json"))
checks["legacyEffect.delayWet"] = legacyEffect[.delayWet]
checks["legacyEffect.reencoded"] = String(decoding: compact, as: UTF8.self)

let legacyCaptureJSON = Data("{\"trigger\":\"gate\",\"startFrame\":0,\"durationSeconds\":6}".utf8)
try legacyCaptureJSON.write(to: legacy.appendingPathComponent("capture-legacy.json"))
let legacyCapture = try JSONDecoder().decode(CaptureCue.self, from: legacyCaptureJSON)
checks["legacyCapture.recordingMode"] = legacyCapture.recordingMode.rawValue
checks["legacyCapture.manualLimitSeconds"] = CaptureCue.manualLimitSeconds

// MARK: - Computed behavior checks

let rate = FrameRate()
checks["timecode.570"] = rate.timecode(570)
checks["frame.roundTrip.2352"] = rate.frame(rate.seconds(2352))
let ntsc = FrameRate(numerator: 24000, denominator: 1001)
checks["ntsc.seconds.24000"] = ntsc.seconds(24000)
checks["ntsc.fps"] = ntsc.fps

let playbackCue = VoiceCue(startFrame: 48, lengthFrames: 144)
checks["playback.2.0"] = playbackCue.playbackFrame(sceneSeconds: 2, rate: rate, voiceAdvanceMs: 0)
checks["playback.1.5.500"] = playbackCue.playbackFrame(sceneSeconds: 1.5, rate: rate, voiceAdvanceMs: 500)
checks["playback.2.5.-500"] = playbackCue.playbackFrame(sceneSeconds: 2.5, rate: rate, voiceAdvanceMs: -500)
checks["playback.7.5.500"] = playbackCue.playbackFrame(sceneSeconds: 7.5, rate: rate, voiceAdvanceMs: 500)
checks["playback.8.5.-500"] = playbackCue.playbackFrame(sceneSeconds: 8.5, rate: rate, voiceAdvanceMs: -500)
checks["playback.1.0.500.speed2"] = playbackCue.playbackFrame(sceneSeconds: 1, rate: rate, voiceAdvanceMs: 500, speed: 2)

checks["envelope.negative"] = playbackCue.envelope(at: -1)
checks["envelope.0"] = playbackCue.envelope(at: 0)
checks["envelope.1"] = playbackCue.envelope(at: 1)
checks["envelope.2"] = playbackCue.envelope(at: 2)
checks["envelope.138"] = playbackCue.envelope(at: 138)
checks["envelope.142"] = playbackCue.envelope(at: 142)
checks["envelope.144"] = playbackCue.envelope(at: 144)

checks["safe.media"] = Project.safeRelativePath("media/a.mp4")
checks["safe.thaiSpace"] = Project.safeRelativePath("media/ภาพ ทดสอบ.mp4")
checks["safe.parent"] = Project.safeRelativePath("../private.wav")
checks["safe.absolute"] = Project.safeRelativePath("/etc/passwd")
checks["safe.colon"] = Project.safeRelativePath("media/a:b.mp4")
checks["safe.backslash"] = Project.safeRelativePath("media/a\\b.mp4")
checks["safe.empty"] = Project.safeRelativePath("")
checks["safe.currentDir"] = Project.safeRelativePath("./media/a.mp4")

// MARK: - Validation cases (message sets, not display order)

func record(_ name: String, _ project: Project) {
    validation[name] = issues(project)
    guard let data = try? prettyEncoded(project) else {
        print("note: \(name) is validation-only (not JSON-serialisable)")
        return
    }
    try? data.write(to: invalidDocuments.appendingPathComponent("\(name).relight"))
}

var invalid = Project.starter
invalid.schemaVersion = 9
record("invalid.schema", invalid)

invalid = Project.starter
invalid.rate.denominator = 0
record("invalid.rateDenominator", invalid)

invalid = Project.starter
invalid.scenes = []
record("invalid.noScenes", invalid)

invalid = Project.starter
invalid.scenes[3].cues[0].effects.feedback = .infinity
record("invalid.feedbackInfinity", invalid)

invalid = Project.starter
invalid.scenes[3].cues.append(VoiceCue(startFrame: 750, lengthFrames: 48))
record("invalid.overlap", invalid)

invalid = Project.starter
invalid.scenes[0].capture = nil
record("invalid.voiceWithoutCapture", invalid)

invalid = Project.starter
invalid.scenes[3].cues[0].startFrame = 900
record("invalid.cueExceedsScene", invalid)

invalid = Project.starter
invalid.scenes[0].frames = Int.max
record("invalid.hugeSceneFrames", invalid)

invalid = Project.starter
invalid.scenes[3].cues[0].startFrame = Int.max
record("invalid.hugeCueStart", invalid)

invalid = Project.starter
invalid.scenes[0].capture?.mode = .manual
invalid.scenes[0].capture?.trigger = .automatic
record("invalid.manualAutomatic", invalid)

invalid = Project.starter
invalid.scenes[3].cues[0].repeatCount = 101
record("invalid.repeatCount", invalid)

invalid = Project.starter
invalid.scenes[3].cues[0].effects[.delayWet] = 1.1
record("invalid.delayWetRange", invalid)

invalid = Project.starter
invalid.scenes[3].cues[0].automation["feedback"] = [AutomationPoint(frame: 0, value: 0.9)]
record("invalid.automationRange", invalid)

invalid = Project.starter
invalid.scenes[3].cues[0].automation["unknown"] = [AutomationPoint(frame: 0, value: 0.5)]
record("invalid.unknownAutomation", invalid)

invalid = Project.starter
invalid.blackFromFrame = 999999
record("invalid.blackFrame", invalid)

invalid = Project.starter
invalid.scenes[0].capture?.trigger = .automatic
invalid.scenes[0].capture?.durationSeconds = 30
record("invalid.captureWindow", invalid)

// MARK: - Manifest

try writeJSON(validation, "validation.json")
try writeJSON(checks, "checks.json")
try writeJSON([
    "source": "native-app/Sources/RELightCore/Project.swift",
    "encoder": "Foundation JSONEncoder, outputFormatting [.prettyPrinted, .sortedKeys]",
    "validationOrder": "sorted",
    "documents": [
        "draft1.relight",
        "starter.relight",
        "full.relight"
    ],
    "validationDocuments": "documents/invalid/<case>.relight",
    "validationOnly": [
        "invalid.feedbackInfinity"
    ]
] as [String: Any], "meta.json")

print("fixtures written to \(output.path)")
