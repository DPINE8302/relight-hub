import Foundation

public enum HIDProtocol {
    public static let version = 1
    public static let maximumLineBytes = 65_536
    public static let maximumDevices = 64
    public static let heartbeatIntervalSeconds: TimeInterval = 2

    public static func boundedJSONLine(_ object: [String: Any]) throws -> Data {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        guard data.count <= maximumLineBytes else { throw HIDProtocolError.messageTooLarge }
        return data + Data([0x0A])
    }
}

public enum HIDProtocolError: Error {
    case messageTooLarge
    case invalidMessage
}

public struct BoundedLineReader: Sendable {
    private var buffer = Data()
    private var discardingOversizedLine = false

    public init() {}

    public mutating func append(_ data: Data) -> (lines: [Data], oversizedLine: Bool) {
        var oversized = false
        var lines: [Data] = []

        for byte in data {
            if discardingOversizedLine {
                if byte == 0x0A { discardingOversizedLine = false }
                continue
            }
            if byte == 0x0A {
                if !buffer.isEmpty { lines.append(buffer) }
                buffer.removeAll(keepingCapacity: true)
                continue
            }
            buffer.append(byte)
            if buffer.count > HIDProtocol.maximumLineBytes {
                buffer.removeAll(keepingCapacity: true)
                discardingOversizedLine = true
                oversized = true
            }
        }
        return (lines, oversized)
    }
}
