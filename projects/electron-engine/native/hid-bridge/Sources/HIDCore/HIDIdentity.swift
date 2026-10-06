import CryptoKit
import Foundation

public enum HIDIdentityQuality: String, Codable, Sendable {
    case serial
    case physical
    case port
    case session
}

public struct HIDIdentity: Equatable, Sendable {
    public let id: String
    public let quality: HIDIdentityQuality
    public let note: String
    public let locationBound: Bool

    public init(id: String, quality: HIDIdentityQuality, note: String, locationBound: Bool) {
        self.id = id
        self.quality = quality
        self.note = note
        self.locationBound = locationBound
    }
}

public enum HIDIdentityResolver {
    private static let namespace = "com.relight.engine.hid.v1"

    public static func resolve(
        vendorID: Int,
        productID: Int,
        serial: String?,
        physicalUniqueID: String?,
        locationID: String?,
        registryEntryID: UInt64,
        bootSessionID: String
    ) -> HIDIdentity {
        let prefix = "\(vendorID):\(productID):"
        if let serial = meaningful(serial) {
            return identity(
                material: prefix + "serial:" + serial,
                quality: .serial,
                note: "Stable device identity",
                locationBound: false
            )
        }
        if let physicalUniqueID = meaningful(physicalUniqueID) {
            return identity(
                material: prefix + "physical:" + physicalUniqueID,
                quality: .physical,
                note: "Stable physical identity",
                locationBound: false
            )
        }
        if let locationID = meaningful(locationID) {
            return identity(
                material: prefix + "port:" + locationID,
                quality: .port,
                note: "Bound to this USB port",
                locationBound: true
            )
        }
        return identity(
            material: prefix + "session:\(bootSessionID):\(registryEntryID)",
            quality: .session,
            note: "Available for this startup only",
            locationBound: false
        )
    }

    public static func elementID(
        deviceID: String,
        cookie: UInt32,
        usagePage: Int,
        usage: Int,
        reportID: Int,
        collectionUsagePage: Int = 0,
        collectionUsage: Int = 0
    ) -> String {
        "element_" + digest(
            "\(deviceID):\(collectionUsagePage):\(collectionUsage):\(cookie):\(usagePage):\(usage):\(reportID)"
        )
    }

    public static func genericLabel(vendorID: Int, productID: Int) -> String {
        String(format: "USB input %04X:%04X", vendorID & 0xffff, productID & 0xffff)
    }

    private static func identity(
        material: String,
        quality: HIDIdentityQuality,
        note: String,
        locationBound: Bool
    ) -> HIDIdentity {
        HIDIdentity(
            id: "hid_" + digest(material),
            quality: quality,
            note: note,
            locationBound: locationBound
        )
    }

    private static func digest(_ material: String) -> String {
        let bytes = Data((namespace + "\u{0}" + material).utf8)
        return SHA256.hash(data: bytes).prefix(16).map { String(format: "%02x", $0) }.joined()
    }

    private static func meaningful(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
