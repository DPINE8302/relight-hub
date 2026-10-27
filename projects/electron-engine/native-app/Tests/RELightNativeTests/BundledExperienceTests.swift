import Foundation
import Testing
import RELightCore
@testable import RELightMac

private func fixture(_ directory: URL, id: String = "film02-test") throws -> URL {
    let folder = directory.appendingPathComponent("Included Experience")
    try FileManager.default.createDirectory(at: folder.appendingPathComponent("media"), withIntermediateDirectories: true)
    var project = Project()
    project.blackFromFrame = nil; project.timecodeStartFrame = 86400; project.requiresPhysicalControls = false
    var scene = Scene(name: "Film 02", thai: "ภาพยนตร์เต็ม", frames: 7200, media: "media/film.mov")
    scene.draft = false; scene.capture = CaptureCue(); scene.capture?.gateFrame = 452
    scene.capture?.narratorMuted = true
    scene.cues = [VoiceCue(startFrame: 6380, lengthFrames: 163)]
    project.scenes = [scene]
    try JSONEncoder().encode(project).write(to: folder.appendingPathComponent("experience.relight"))
    try Data([1, 2, 3]).write(to: folder.appendingPathComponent("media/film.mov"))
    try JSONSerialization.data(withJSONObject: ["schemaVersion": 1, "id": id, "title": "Film 02", "projectSHA256": try BundledExperience.checksum(folder.appendingPathComponent("experience.relight")), "files": [["path": "media/film.mov", "sha256": try BundledExperience.checksum(folder.appendingPathComponent("media/film.mov"))]]]).write(to: folder.appendingPathComponent("manifest.json"))
    return folder
}

@Test func includedFilmSelectedOnFirstInstallAndUpgradeWithoutOverwritingProjects() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let resources = root.appendingPathComponent("Resources"), support = root.appendingPathComponent("Support")
    let folder = try fixture(resources)
    let suite = "IncludedTests-" + UUID().uuidString, preferences = UserDefaults(suiteName: suite)!
    defer { preferences.removePersistentDomain(forName: suite) }
    let old = root.appendingPathComponent("old.relight")
    try Data("existing project".utf8).write(to: old)
    preferences.set(old.path, forKey: "native.project")
    let included = try BundledExperience.read(resources: resources)!
    let selected = try included.initialProject(support: support, resources: resources, preferences: preferences)
    #expect(selected.lastPathComponent == "experience.relight")
    #expect(try String(contentsOf: old, encoding: .utf8) == "existing project")
    let installed = try JSONDecoder().decode(Project.self, from: Data(contentsOf: selected))
    #expect(installed.scenes[0].capture?.gateFrame == 452)
    #expect(installed.scenes[0].cues[0].startFrame == 6380)
    // Explicitly opening another valid project persists across code-only updates.
    try Data(contentsOf: folder.appendingPathComponent("experience.relight")).write(to: old)
    preferences.set(old.path, forKey: "native.project")
    // Damage an unused included copy; the valid remembered external project wins.
    try Data("corrupt unused copy".utf8).write(to: selected)
    #expect(try included.initialProject(support: support, resources: resources, preferences: preferences) == old)
    // A newly supplied experience gets its own working copy; old files survive.
    _ = try fixture(resources, id: "film03-test")
    let next = try BundledExperience.read(resources: resources)!.initialProject(support: support, resources: resources, preferences: preferences)
    #expect(next != selected)
    #expect(FileManager.default.fileExists(atPath: selected.path))
}

@Test func includedExperienceRepairsMissingMediaAndPreservesSavedSettings() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let resources = root.appendingPathComponent("Resources"), support = root.appendingPathComponent("Support")
    _ = try fixture(resources)
    let included = try BundledExperience.read(resources: resources)!
    let file = try included.prepare(support: support, resources: resources)
    var edited = try JSONDecoder().decode(Project.self, from: Data(contentsOf: file))
    edited.title = "Operator edits"; edited.voiceLevel = 0.42
    try JSONEncoder().encode(edited).write(to: file)
    let movie = file.deletingLastPathComponent().appendingPathComponent("media/film.mov")
    try FileManager.default.removeItem(at: movie)
    _ = try included.prepare(support: support, resources: resources)
    #expect(try JSONDecoder().decode(Project.self, from: Data(contentsOf: file)) == edited)
    #expect(try Data(contentsOf: movie) == Data([1, 2, 3]))
}

@Test func includedExperienceRejectsInvalidManifestMissingMediaAndEscapingDestination() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let resources = root.appendingPathComponent("Resources"), support = root.appendingPathComponent("Support")
    let folder = try fixture(resources, id: "../escape")
    #expect(throws: (any Error).self) { try BundledExperience.read(resources: resources) }
    _ = try fixture(resources)
    let included = try BundledExperience.read(resources: resources)!
    try Data([9, 9, 9]).write(to: folder.appendingPathComponent("media/film.mov"))
    #expect(throws: (any Error).self) { try included.prepare(support: support, resources: resources) }
    try FileManager.default.removeItem(at: folder.appendingPathComponent("media/film.mov"))
    #expect(throws: (any Error).self) { try included.prepare(support: support, resources: resources) }
    _ = try fixture(resources)
    try FileManager.default.removeItem(at: support.appendingPathComponent("Included Experiences"))
    try FileManager.default.createSymbolicLink(at: support.appendingPathComponent("Included Experiences"), withDestinationURL: root)
    #expect(throws: (any Error).self) { try included.prepare(support: support, resources: resources) }
}

@Test @MainActor func loadedProjectRestoresNarratorMute() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let folder = try fixture(root.appendingPathComponent("Resources"))
    let studio = makeTestStudio(storageRoot: root.appendingPathComponent("Studio"))
    defer { studio.shutdown() }
    studio.loadProject(folder.appendingPathComponent("experience.relight"))
    #expect(studio.narratorMuted)
    studio.setNarratorMuted(false)
    #expect(!studio.narratorMuted)
    #expect(studio.dirty)
    studio.save()
    studio.loadProject(folder.appendingPathComponent("experience.relight"))
    #expect(!studio.narratorMuted)
    studio.state = .countdown
    studio.setNarratorMuted(true)
    #expect(studio.narratorMuted && studio.dirty)
    studio.stop()
    studio.save()
    studio.loadProject(folder.appendingPathComponent("experience.relight"))
    #expect(studio.narratorMuted)
}
