import Foundation
import CryptoKit
import RELightCore

/// Content identity is independent of app version, so code updates do not reset edits.
struct BundledExperience: Decodable {
    let id: String
    let title: String
    let schemaVersion: Int
    let projectSHA256: String
    let files: [MediaFile]
    struct MediaFile: Decodable { let path: String; let sha256: String }

    static func checksum(_ url: URL) throws -> String {
        let stream = try FileHandle(forReadingFrom: url)
        defer { try? stream.close() }
        var digest = SHA256()
        while let data = try stream.read(upToCount: 1024 * 1024), !data.isEmpty { digest.update(data: data) }
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }

    static func read(resources: URL) throws -> Self? {
        let manifest = resources.appendingPathComponent("Included Experience/manifest.json")
        guard FileManager.default.fileExists(atPath: manifest.path) else { return nil }
        let value = try JSONDecoder().decode(Self.self, from: Data(contentsOf: manifest))
        guard value.schemaVersion == 1, (1...100).contains(value.id.count),
              value.id.utf8.allSatisfy({ (48...57).contains($0) || (65...90).contains($0) || (97...122).contains($0) || $0 == 45 }) else {
            throw AudioFailure("The included experience manifest is invalid.")
        }
        return value
    }

    func prepare(support: URL, resources: URL) throws -> URL {
        let manager = FileManager.default
        let bundled = resources.appendingPathComponent("Included Experience")
        let sourceProject = bundled.appendingPathComponent("experience.relight")
        guard try Self.checksum(sourceProject) == projectSHA256 else { throw AudioFailure("The included project checksum is invalid. Download the complete app again.") }
        let project = try JSONDecoder().decode(Project.self, from: Data(contentsOf: sourceProject))
        guard project.validation().isEmpty else { throw AudioFailure("The included experience has invalid settings.") }
        let parent = support.appendingPathComponent("Included Experiences")
        let destination = parent.appendingPathComponent(id)
        let paths = project.referencedMedia.union(["experience.relight"])
        guard Set(files.map(\.path)) == project.referencedMedia, Set(files.map(\.path)).count == files.count else { throw AudioFailure("The included media manifest does not match its project.") }
        for relative in paths {
            guard let source = project.assetURL(relative, root: bundled), manager.fileExists(atPath: source.path) else {
                throw AudioFailure("An included experience file is missing: \(relative)")
            }
        }
        // Never follow an edited support-directory link to write into another project.
        let supportPath = support.resolvingSymlinksInPath().standardizedFileURL.path + "/"
        try manager.createDirectory(at: parent, withIntermediateDirectories: true)
        guard parent.resolvingSymlinksInPath().standardizedFileURL.path.hasPrefix(supportPath),
              (try? manager.attributesOfItem(atPath: destination.path)[.type] as? FileAttributeType) != .typeSymbolicLink,
              destination.resolvingSymlinksInPath().standardizedFileURL.path.hasPrefix(supportPath) else {
            throw AudioFailure("The included experience destination is outside app storage.")
        }
        if !manager.fileExists(atPath: destination.path) {
            for record in files {
                guard try Self.checksum(project.assetURL(record.path, root: bundled)!) == record.sha256 else { throw AudioFailure("Included media checksum failed: \(record.path)") }
            }
            let staging = parent.appendingPathComponent(".install-" + UUID().uuidString)
            defer { try? manager.removeItem(at: staging) }
            for relative in paths {
                let source = project.assetURL(relative, root: bundled)!
                let target = project.assetURL(relative, root: staging)!
                try manager.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                try manager.copyItem(at: source, to: target)
            }
            try manager.moveItem(at: staging, to: destination)
        } else {
            // Repair omitted distribution files without replacing an operator's edits.
            for relative in paths {
                guard let target = project.assetURL(relative, root: destination) else { throw AudioFailure("Unsafe included experience destination.") }
                if !manager.fileExists(atPath: target.path) {
                    if let record = files.first(where: { $0.path == relative }), try Self.checksum(project.assetURL(relative, root: bundled)!) != record.sha256 { throw AudioFailure("Included media checksum failed: \(relative)") }
                    try manager.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try manager.copyItem(at: project.assetURL(relative, root: bundled)!, to: target)
                }
            }
        }
        return destination.appendingPathComponent("experience.relight")
    }

    /// Select a newly supplied film once. Existing projects remain available on disk.
    func initialProject(support: URL, resources: URL, preferences: UserDefaults) throws -> URL {
        if preferences.string(forKey: "native.includedExperienceID") == id,
           let remembered = preferences.string(forKey: "native.project"),
           FileManager.default.fileExists(atPath: remembered),
           let data = try? Data(contentsOf: URL(fileURLWithPath: remembered)),
           let project = try? JSONDecoder().decode(Project.self, from: data), project.validation().isEmpty {
            let expected = support.appendingPathComponent("Included Experiences").appendingPathComponent(id).appendingPathComponent("experience.relight")
            if URL(fileURLWithPath: remembered).standardizedFileURL == expected.standardizedFileURL {
                return try prepare(support: support, resources: resources)
            }
            return URL(fileURLWithPath: remembered)
        }
        let included = try prepare(support: support, resources: resources)
        let saved = try JSONDecoder().decode(Project.self, from: Data(contentsOf: included))
        guard saved.validation().isEmpty else { throw AudioFailure("The saved included experience needs repair. Open a valid project from File → Open Project.") }
        preferences.set(id, forKey: "native.includedExperienceID")
        preferences.set(included.path, forKey: "native.project")
        return included
    }
}
