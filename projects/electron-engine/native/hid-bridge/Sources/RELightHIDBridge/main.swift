import CryptoKit
import Darwin
import Foundation
import HIDCore
import IOKit
import IOKit.hid

private typealias JSON = [String: Any]

private struct WireBinding: Codable {
    let role: String
    let deviceId: String
    let deviceLabel: String
    let elementId: String
    let elementLabel: String
    let usagePage: Int
    let usage: Int
    let reportId: Int
    let logicalMinimum: Int
    let logicalMaximum: Int
    let releasedValue: Int
    let pressedValue: Int
    let identityQuality: String
    let locationBound: Bool
    let assignedAt: Int64
    let lastSeenAt: Int64?

    var json: JSON {
        [
            "role": role,
            "deviceId": deviceId,
            "deviceLabel": deviceLabel,
            "elementId": elementId,
            "elementLabel": elementLabel,
            "usagePage": usagePage,
            "usage": usage,
            "reportId": reportId,
            "logicalMinimum": logicalMinimum,
            "logicalMaximum": logicalMaximum,
            "releasedValue": releasedValue,
            "pressedValue": pressedValue,
            "identityQuality": identityQuality,
            "locationBound": locationBound,
            "assignedAt": assignedAt,
            "lastSeenAt": lastSeenAt.map { $0 as Any } ?? NSNull(),
        ]
    }
}

private struct CommandEnvelope: Decodable {
    let version: Int
    let kind: String
    let command: String
    let requestId: String
    let active: Bool?
    let role: String?
    let token: String?
    let bindings: [WireBinding]?
}

private final class OutputWriter: @unchecked Sendable {
    private let lock = NSLock()

    func send(_ object: JSON) {
        lock.lock()
        defer { lock.unlock() }
        do {
            FileHandle.standardOutput.write(try HIDProtocol.boundedJSONLine(object))
        } catch {
            // Output is deliberately silent on failure: stderr could be captured by a host
            // with weaker privacy guarantees and no visitor input may be written anywhere.
        }
    }
}

private struct ManagedElement {
    let reference: IOHIDElement
    let id: String
    let label: String
    let usagePage: Int
    let usage: Int
    let reportID: Int
    let logicalMinimum: Int
    let logicalMaximum: Int
}

private final class ManagedDevice {
    let reference: IOHIDDevice
    let key: Int
    let id: String
    let label: String
    let vendorID: Int
    let productID: Int
    let identity: HIDIdentity
    let internalDevice: Bool
    let assignable: Bool
    let reason: String?
    let elements: [String: ManagedElement]
    var values: [String: Int] = [:]
    var lastSeenAt: Int64?

    init(
        reference: IOHIDDevice,
        key: Int,
        id: String,
        label: String,
        vendorID: Int,
        productID: Int,
        identity: HIDIdentity,
        internalDevice: Bool,
        assignable: Bool,
        reason: String?,
        elements: [String: ManagedElement],
        lastSeenAt: Int64?
    ) {
        self.reference = reference
        self.key = key
        self.id = id
        self.label = label
        self.vendorID = vendorID
        self.productID = productID
        self.identity = identity
        self.internalDevice = internalDevice
        self.assignable = assignable
        self.reason = reason
        self.elements = elements
        self.lastSeenAt = lastSeenAt
    }

    var descriptor: JSON {
        [
            "id": id,
            "label": label,
            "manufacturer": NSNull(),
            "vendorId": vendorID,
            "productId": productID,
            "transport": "USB",
            "identityQuality": identity.quality.rawValue,
            "identityNote": identity.note,
            "locationBound": identity.locationBound,
            "internal": internalDevice,
            "connected": true,
            "assignable": assignable,
            "assignableElementCount": elements.count,
            "reason": reason.map { $0 as Any } ?? NSNull(),
            "lastSeenAt": lastSeenAt.map { $0 as Any } ?? NSNull(),
        ]
    }
}

private final class LearnSession {
    let token: String
    let role: String
    var tracker = HIDLearningTracker()

    init(token: String, role: String) {
        self.token = token
        self.role = role
    }
}

private final class HIDBridge: @unchecked Sendable {
    private let writer = OutputWriter()
    private let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
    private let bootSessionID: String
    private var managerOpened = false
    private var devices: [Int: ManagedDevice] = [:]
    private var assignments: [String: WireBinding] = [:]
    private var assignmentDown: [String: Bool] = [:]
    private var learning: LearnSession?
    private var foreground = false
    private var heartbeatSequence = 0
    private var lastReportedAccess: String
    private var heartbeatTimer: DispatchSourceTimer?
    private var lineReader = BoundedLineReader()
    private var inputHandlerInstalled = false

    init() {
        bootSessionID = HIDBridge.currentBootSessionID()
        lastReportedAccess = "unknown"
    }

    deinit {
        heartbeatTimer?.cancel()
        FileHandle.standardInput.readabilityHandler = nil
        if managerOpened {
            closeManager()
        }
    }

    func run() {
        installInputHandler()
        startHeartbeat()
        writer.send([
            "version": HIDProtocol.version,
            "kind": "event",
            "event": "ready",
            "access": accessStatus(),
            "occurredAt": nowMS(),
        ])
        RunLoop.main.run()
    }

    private func installInputHandler() {
        guard !inputHandlerInstalled else { return }
        inputHandlerInstalled = true
        FileHandle.standardInput.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty {
                DispatchQueue.main.async { self?.shutdown() }
                return
            }
            DispatchQueue.main.async { self?.receive(data) }
        }
    }

    private func receive(_ data: Data) {
        let result = lineReader.append(data)
        if result.oversizedLine {
            sendError(code: "messageTooLarge", message: "Command exceeded the protocol limit", recoverable: true)
        }
        for line in result.lines {
            do {
                let command = try strictCommandEnvelope(from: line)
                guard command.version == HIDProtocol.version,
                      command.kind == "command",
                      command.requestId.count <= 80 else {
                    throw HIDProtocolError.invalidMessage
                }
                handle(command)
            } catch {
                sendError(code: "invalidCommand", message: "Command was rejected", recoverable: true)
            }
        }
    }

    private func strictCommandEnvelope(from data: Data) throws -> CommandEnvelope {
        guard let raw = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let commandName = raw["command"] as? String else {
            throw HIDProtocolError.invalidMessage
        }
        let baseKeys: Set<String> = ["version", "kind", "command", "requestId"]
        let allowedKeys: Set<String>
        switch commandName {
        case "foreground.set": allowedKeys = baseKeys.union(["active"])
        case "learn.start": allowedKeys = baseKeys.union(["role"])
        case "learn.cancel": allowedKeys = baseKeys.union(["token"])
        case "assignments.set": allowedKeys = baseKeys.union(["bindings"])
        case "inventory.refresh", "access.request", "ping", "shutdown": allowedKeys = baseKeys
        default: throw HIDProtocolError.invalidMessage
        }
        guard Set(raw.keys).isSubset(of: allowedKeys) else { throw HIDProtocolError.invalidMessage }

        if let bindings = raw["bindings"] as? [[String: Any]] {
            let bindingKeys: Set<String> = [
                "role", "deviceId", "deviceLabel", "elementId", "elementLabel", "usagePage", "usage",
                "reportId", "logicalMinimum", "logicalMaximum", "releasedValue", "pressedValue",
                "identityQuality", "locationBound", "assignedAt", "lastSeenAt",
            ]
            guard bindings.allSatisfy({ Set($0.keys) == bindingKeys }) else {
                throw HIDProtocolError.invalidMessage
            }
        }
        return try JSONDecoder().decode(CommandEnvelope.self, from: data)
    }

    private func handle(_ command: CommandEnvelope) {
        switch command.command {
        case "inventory.refresh":
            if accessStatus() == "granted" {
                openManagerIfPermitted()
                enumerateCurrentDevices()
            }
            respond(command, payload: ["devices": inventory()])
        case "access.request":
            let granted = IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)
            let status: String
            if granted {
                status = "granted"
                openManagerIfPermitted()
            } else {
                let checked = accessStatus()
                status = checked == "unknown" ? "restartRequired" : checked
            }
            respond(command, payload: ["access": status])
            writer.send([
                "version": HIDProtocol.version,
                "kind": "event",
                "event": "access.changed",
                "access": status,
                "occurredAt": nowMS(),
            ])
        case "foreground.set":
            guard let active = command.active else {
                reject(command, code: "invalidCommand", message: "Foreground state is required")
                return
            }
            foreground = active
            if !active {
                learning = nil
                assignmentDown.removeAll()
            }
            respond(command)
        case "learn.start":
            guard foreground,
                  let role = command.role,
                  validRole(role) else {
                reject(command, code: "learningUnavailable", message: "Learning requires the foreground app")
                return
            }
            let token = UUID().uuidString.lowercased()
            learning = LearnSession(token: token, role: role)
            respond(command, payload: ["token": token])
            writer.send([
                "version": HIDProtocol.version,
                "kind": "event",
                "event": "learn.progress",
                "token": token,
                "role": role,
                "phase": "waiting",
                "pressCount": 0,
                "occurredAt": nowMS(),
            ])
        case "learn.cancel":
            if let expected = command.token,
               let learning,
               expected != learning.token {
                reject(command, code: "staleLearningToken", message: "Learning session is no longer active")
                return
            }
            learning = nil
            respond(command)
        case "assignments.set":
            guard let bindings = command.bindings,
                  bindings.count <= 2,
                  Set(bindings.map(\.role)).count == bindings.count,
                  bindings.allSatisfy({ validBinding($0) }) else {
                reject(command, code: "invalidBinding", message: "Input assignment was rejected")
                return
            }
            assignments = Dictionary(uniqueKeysWithValues: bindings.map { ($0.role, $0) })
            assignmentDown.removeAll()
            respond(command)
        case "ping":
            respond(command, payload: ["occurredAt": nowMS()])
        case "shutdown":
            respond(command)
            shutdown()
        default:
            reject(command, code: "unsupportedCommand", message: "Command is not supported")
        }
    }

    private func openManagerIfPermitted() {
        guard !managerOpened, accessStatus() == "granted" else { return }
        let matching: NSDictionary = [kIOHIDTransportKey as String: "USB"]
        IOHIDManagerSetDeviceMatching(manager, matching)

        let context = Unmanaged.passUnretained(self).toOpaque()
        IOHIDManagerRegisterDeviceMatchingCallback(manager, { context, _, _, device in
            guard let context else { return }
            Unmanaged<HIDBridge>.fromOpaque(context).takeUnretainedValue().deviceAdded(device)
        }, context)
        IOHIDManagerRegisterDeviceRemovalCallback(manager, { context, _, _, device in
            guard let context else { return }
            Unmanaged<HIDBridge>.fromOpaque(context).takeUnretainedValue().deviceRemoved(device)
        }, context)
        IOHIDManagerRegisterInputValueCallback(manager, { context, _, _, value in
            guard let context else { return }
            Unmanaged<HIDBridge>.fromOpaque(context).takeUnretainedValue().inputValue(value)
        }, context)
        IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
        let result = IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
        guard result == kIOReturnSuccess else {
            IOHIDManagerUnscheduleFromRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
            sendError(code: "managerOpenFailed", message: "USB input service could not start", recoverable: false)
            return
        }
        managerOpened = true
        enumerateCurrentDevices()
    }

    private func enumerateCurrentDevices() {
        guard managerOpened,
              let current = IOHIDManagerCopyDevices(manager) as? Set<IOHIDDevice> else { return }
        for device in current { deviceAdded(device) }
    }

    private func deviceAdded(_ reference: IOHIDDevice) {
        guard devices.count < HIDProtocol.maximumDevices else {
            sendError(code: "deviceLimit", message: "Too many USB input devices", recoverable: true)
            return
        }
        let key = deviceKey(reference)
        guard devices[key] == nil else { return }

        let transport = stringProperty(reference, kIOHIDTransportKey)
        guard transport.caseInsensitiveCompare("USB") == .orderedSame else { return }

        let vendorID = intProperty(reference, kIOHIDVendorIDKey)
        let productID = intProperty(reference, kIOHIDProductIDKey)
        let deviceUsagePage = intProperty(reference, kIOHIDPrimaryUsagePageKey)
        let deviceUsage = intProperty(reference, kIOHIDPrimaryUsageKey)
        let internalDevice = boolProperty(reference, kIOHIDBuiltInKey)
        let identity = HIDIdentityResolver.resolve(
            vendorID: vendorID,
            productID: productID,
            serial: optionalStringProperty(reference, kIOHIDSerialNumberKey),
            physicalUniqueID: optionalPropertyDescription(reference, kIOHIDUniqueIDKey),
            locationID: optionalPropertyDescription(reference, kIOHIDLocationIDKey),
            registryEntryID: registryEntryID(reference),
            bootSessionID: bootSessionID
        )
        let label = HIDIdentityResolver.genericLabel(vendorID: vendorID, productID: productID)
        var elements: [String: ManagedElement] = [:]

        if !internalDevice,
           let matches = IOHIDDeviceCopyMatchingElements(reference, nil, IOOptionBits(kIOHIDOptionsTypeNone)) as? [IOHIDElement] {
            for element in matches.prefix(2_048) {
                let usagePage = Int(IOHIDElementGetUsagePage(element))
                let usage = Int(IOHIDElementGetUsage(element))
                let logicalMinimum = IOHIDElementGetLogicalMin(element)
                let logicalMaximum = IOHIDElementGetLogicalMax(element)
                let type = IOHIDElementGetType(element)
                let input = type == kIOHIDElementTypeInput_Misc
                    || type == kIOHIDElementTypeInput_Button
                    || type == kIOHIDElementTypeInput_ScanCodes
                guard HIDElementPolicy.isAssignable(
                    deviceUsagePage: deviceUsagePage,
                    deviceUsage: deviceUsage,
                    elementUsagePage: usagePage,
                    elementUsage: usage,
                    isInput: input,
                    logicalMinimum: logicalMinimum,
                    logicalMaximum: logicalMaximum
                ) else { continue }
                let cookie = UInt32(IOHIDElementGetCookie(element))
                let reportID = Int(IOHIDElementGetReportID(element))
                let id = HIDIdentityResolver.elementID(
                    deviceID: identity.id,
                    cookie: cookie,
                    usagePage: usagePage,
                    usage: usage,
                    reportID: reportID,
                    collectionUsagePage: deviceUsagePage,
                    collectionUsage: deviceUsage
                )
                elements[id] = ManagedElement(
                    reference: element,
                    id: id,
                    label: HIDElementPolicy.genericElementLabel(usagePage: usagePage, usage: usage),
                    usagePage: usagePage,
                    usage: usage,
                    reportID: reportID,
                    logicalMinimum: logicalMinimum,
                    logicalMaximum: logicalMaximum
                )
            }
        }

        let isMouse = HIDElementPolicy.deviceIsMouse(usagePage: deviceUsagePage, usage: deviceUsage)
        let isSensor = HIDElementPolicy.deviceIsSensor(usagePage: deviceUsagePage)
        let reason: String? = internalDevice
            ? "Internal input devices cannot be assigned"
            : isMouse
                ? "Pointing devices cannot be assigned"
                : isSensor
                    ? "Sensor devices cannot be assigned"
                    : (elements.isEmpty ? "No compatible momentary controls" : nil)
        let device = ManagedDevice(
            reference: reference,
            key: key,
            id: identity.id,
            label: label,
            vendorID: vendorID,
            productID: productID,
            identity: identity,
            internalDevice: internalDevice,
            assignable: reason == nil,
            reason: reason,
            elements: elements,
            lastSeenAt: nowMS()
        )
        primeValues(device)
        devices[key] = device
        guard let descriptor = groupDescriptor(for: device.id) else { return }
        writer.send([
            "version": HIDProtocol.version,
            "kind": "event",
            "event": "device.added",
            "device": descriptor,
            "occurredAt": nowMS(),
        ])
    }

    private func deviceRemoved(_ reference: IOHIDDevice) {
        let key = deviceKey(reference)
        guard let removed = devices.removeValue(forKey: key) else { return }
        if let descriptor = groupDescriptor(for: removed.id) {
            writer.send([
                "version": HIDProtocol.version,
                "kind": "event",
                "event": "device.added",
                "device": descriptor,
                "occurredAt": nowMS(),
            ])
        } else {
            writer.send([
                "version": HIDProtocol.version,
                "kind": "event",
                "event": "device.removed",
                "deviceId": removed.id,
                "occurredAt": nowMS(),
            ])
        }
    }

    private func inputValue(_ value: IOHIDValue) {
        let element = IOHIDValueGetElement(value)
        let reference = IOHIDElementGetDevice(element)
        guard let device = devices[deviceKey(reference)] else { return }
        let cookie = UInt32(IOHIDElementGetCookie(element))
        let usagePage = Int(IOHIDElementGetUsagePage(element))
        let usage = Int(IOHIDElementGetUsage(element))
        let reportID = Int(IOHIDElementGetReportID(element))
        let elementID = HIDIdentityResolver.elementID(
            deviceID: device.id,
            cookie: cookie,
            usagePage: usagePage,
            usage: usage,
            reportID: reportID,
            collectionUsagePage: intProperty(reference, kIOHIDPrimaryUsagePageKey),
            collectionUsage: intProperty(reference, kIOHIDPrimaryUsageKey)
        )
        guard let managedElement = device.elements[elementID] else { return }
        let current = IOHIDValueGetIntegerValue(value)
        let previous = device.values[elementID] ?? current
        device.values[elementID] = current
        device.lastSeenAt = nowMS()
        guard current != previous, foreground else { return }

        if let learning {
            let update = learning.tracker.observe(
                deviceID: device.id,
                elementID: elementID,
                previousValue: previous,
                value: current,
                occurredAtMS: nowMS()
            )
            handleLearningUpdate(update, session: learning, device: device, element: managedElement)
            return
        }

        for binding in assignments.values where binding.deviceId == device.id && binding.elementId == elementID {
            let down = current == binding.pressedValue
            let wasDown = assignmentDown[binding.role] ?? false
            guard down != wasDown else { continue }
            assignmentDown[binding.role] = down
            writer.send([
                "version": HIDProtocol.version,
                "kind": "event",
                "event": "input.edge",
                "role": binding.role,
                "deviceId": binding.deviceId,
                "elementId": binding.elementId,
                "edge": down ? "down" : "up",
                "occurredAt": nowMS(),
            ])
        }
    }

    private func handleLearningUpdate(
        _ update: HIDLearningUpdate,
        session: LearnSession,
        device: ManagedDevice,
        element: ManagedElement
    ) {
        switch update {
        case .ignored:
            return
        case .firstPress:
            writer.send(learnProgress(session: session, phase: "firstPress", pressCount: 0))
        case let .progress(_, completedPresses):
            writer.send(learnProgress(session: session, phase: "firstPress", pressCount: completedPresses))
        case let .complete(candidate):
            let timestamp = nowMS()
            let binding = WireBinding(
                role: session.role,
                deviceId: device.id,
                deviceLabel: device.label,
                elementId: element.id,
                elementLabel: element.label,
                usagePage: element.usagePage,
                usage: element.usage,
                reportId: element.reportID,
                logicalMinimum: element.logicalMinimum,
                logicalMaximum: element.logicalMaximum,
                releasedValue: candidate.releasedValue,
                pressedValue: candidate.pressedValue,
                identityQuality: device.identity.quality.rawValue,
                locationBound: device.identity.locationBound,
                assignedAt: timestamp,
                lastSeenAt: timestamp
            )
            writer.send([
                "version": HIDProtocol.version,
                "kind": "event",
                "event": "learn.candidate",
                "token": session.token,
                "role": session.role,
                "binding": binding.json,
                "occurredAt": timestamp,
            ])
            learning = nil
        }
    }

    private func learnProgress(session: LearnSession, phase: String, pressCount: Int) -> JSON {
        [
            "version": HIDProtocol.version,
            "kind": "event",
            "event": "learn.progress",
            "token": session.token,
            "role": session.role,
            "phase": phase,
            "pressCount": pressCount,
            "occurredAt": nowMS(),
        ]
    }

    private func primeValues(_ device: ManagedDevice) {
        for element in device.elements.values {
            let placeholder = IOHIDValueCreateWithIntegerValue(
                kCFAllocatorDefault,
                element.reference,
                0,
                element.logicalMinimum
            )
            var value = Unmanaged.passUnretained(placeholder)
            if IOHIDDeviceGetValue(device.reference, element.reference, &value) == kIOReturnSuccess {
                device.values[element.id] = IOHIDValueGetIntegerValue(value.takeUnretainedValue())
            }
        }
    }

    private func inventory() -> [JSON] {
        Set(devices.values.map(\.id))
            .sorted()
            .prefix(HIDProtocol.maximumDevices)
            .compactMap { groupDescriptor(for: $0) }
    }

    private func groupDescriptor(for deviceID: String) -> JSON? {
        let group = devices.values.filter { $0.id == deviceID }
        guard let first = group.first else { return nil }
        var descriptor = first.descriptor
        let elementCount = min(2_048, Set(group.flatMap { $0.elements.keys }).count)
        let assignable = elementCount > 0
        descriptor["assignableElementCount"] = elementCount
        descriptor["assignable"] = assignable
        if assignable {
            descriptor["reason"] = NSNull()
        } else if group.allSatisfy({ $0.reason == "Internal input devices cannot be assigned" }) {
            descriptor["reason"] = "Internal input devices cannot be assigned"
        } else if group.allSatisfy({ $0.reason == "Pointing devices cannot be assigned" }) {
            descriptor["reason"] = "Pointing devices cannot be assigned"
        } else if group.allSatisfy({ $0.reason == "Sensor devices cannot be assigned" }) {
            descriptor["reason"] = "Sensor devices cannot be assigned"
        } else {
            descriptor["reason"] = "No compatible momentary controls"
        }
        descriptor["lastSeenAt"] = group.compactMap(\.lastSeenAt).max().map { $0 as Any } ?? NSNull()
        return descriptor
    }

    private func accessStatus() -> String {
        switch IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) {
        case kIOHIDAccessTypeGranted: return "granted"
        case kIOHIDAccessTypeDenied: return "denied"
        default: return "unknown"
        }
    }

    private func startHeartbeat() {
        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + HIDProtocol.heartbeatIntervalSeconds, repeating: HIDProtocol.heartbeatIntervalSeconds)
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            heartbeatSequence += 1
            let access = accessStatus()
            if access != "granted" && managerOpened {
                let removedDeviceIDs = Set(devices.values.map(\.id))
                devices.removeAll()
                closeManager()
                for deviceID in removedDeviceIDs {
                    writer.send([
                        "version": HIDProtocol.version,
                        "kind": "event",
                        "event": "device.removed",
                        "deviceId": deviceID,
                        "occurredAt": nowMS(),
                    ])
                }
            }
            if access != lastReportedAccess {
                lastReportedAccess = access
                writer.send([
                    "version": HIDProtocol.version,
                    "kind": "event",
                    "event": "access.changed",
                    "access": access,
                    "occurredAt": nowMS(),
                ])
            }
            writer.send([
                "version": HIDProtocol.version,
                "kind": "event",
                "event": "heartbeat",
                "sequence": heartbeatSequence,
                "access": access,
                "occurredAt": nowMS(),
            ])
        }
        heartbeatTimer = timer
        timer.resume()
    }

    private func respond(_ command: CommandEnvelope, payload: JSON = [:]) {
        var response: JSON = [
            "version": HIDProtocol.version,
            "kind": "response",
            "command": command.command,
            "requestId": command.requestId,
            "ok": true,
        ]
        for (key, value) in payload { response[key] = value }
        writer.send(response)
    }

    private func reject(_ command: CommandEnvelope, code: String, message: String) {
        writer.send([
            "version": HIDProtocol.version,
            "kind": "response",
            "command": command.command,
            "requestId": command.requestId,
            "ok": false,
            "error": ["code": code, "message": message],
        ])
    }

    private func sendError(code: String, message: String, recoverable: Bool) {
        writer.send([
            "version": HIDProtocol.version,
            "kind": "event",
            "event": "error",
            "code": code,
            "message": message,
            "recoverable": recoverable,
            "occurredAt": nowMS(),
        ])
    }

    private func validRole(_ role: String) -> Bool {
        role == "RECORD_BUTTON" || role == "CHOICE_BUTTON"
    }

    private func validBinding(_ binding: WireBinding) -> Bool {
        let compatibleButton = binding.usagePage == HIDElementPolicy.buttonPage && binding.usage > 0
        let compatibleKey = binding.usagePage == HIDElementPolicy.keyboardOrKeypadPage
            && binding.usage >= 4
            && !(0xE0...0xE7).contains(binding.usage)
        let expectedElementLabel = compatibleButton ? "Button \(binding.usage)" : "Keyboard control \(binding.usage)"
        return validRole(binding.role)
            && binding.deviceId.hasPrefix("hid_")
            && binding.elementId.hasPrefix("element_")
            && binding.deviceId.count <= 48
            && binding.elementId.count <= 64
            && binding.deviceLabel.hasPrefix("USB input ")
            && binding.deviceLabel.count <= 80
            && (compatibleButton || compatibleKey)
            && binding.elementLabel == expectedElementLabel
            && ["serial", "physical", "port", "session"].contains(binding.identityQuality)
            && binding.logicalMaximum > binding.logicalMinimum
            && binding.logicalMaximum - binding.logicalMinimum == 1
            && binding.releasedValue != binding.pressedValue
            && binding.releasedValue >= binding.logicalMinimum
            && binding.releasedValue <= binding.logicalMaximum
            && binding.pressedValue >= binding.logicalMinimum
            && binding.pressedValue <= binding.logicalMaximum
            && binding.assignedAt >= 0
    }

    private func shutdown() {
        heartbeatTimer?.cancel()
        heartbeatTimer = nil
        FileHandle.standardInput.readabilityHandler = nil
        if managerOpened {
            closeManager()
        }
        Darwin.exit(0)
    }

    private func closeManager() {
        guard managerOpened else { return }
        IOHIDManagerUnscheduleFromRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
        IOHIDManagerClose(manager, IOOptionBits(kIOHIDOptionsTypeNone))
        managerOpened = false
    }

    private func intProperty(_ device: IOHIDDevice, _ key: String) -> Int {
        (IOHIDDeviceGetProperty(device, key as CFString) as? NSNumber)?.intValue ?? 0
    }

    private func boolProperty(_ device: IOHIDDevice, _ key: String) -> Bool {
        (IOHIDDeviceGetProperty(device, key as CFString) as? NSNumber)?.boolValue ?? false
    }

    private func stringProperty(_ device: IOHIDDevice, _ key: String) -> String {
        optionalStringProperty(device, key) ?? ""
    }

    private func optionalStringProperty(_ device: IOHIDDevice, _ key: String) -> String? {
        IOHIDDeviceGetProperty(device, key as CFString) as? String
    }

    private func optionalPropertyDescription(_ device: IOHIDDevice, _ key: String) -> String? {
        guard let property = IOHIDDeviceGetProperty(device, key as CFString) else { return nil }
        if let number = property as? NSNumber { return number.stringValue }
        if let string = property as? String { return string }
        return nil
    }

    private func registryEntryID(_ device: IOHIDDevice) -> UInt64 {
        var identifier: UInt64 = 0
        let service = IOHIDDeviceGetService(device)
        guard service != 0,
              IORegistryEntryGetRegistryEntryID(service, &identifier) == KERN_SUCCESS else { return 0 }
        return identifier
    }

    private func deviceKey(_ device: IOHIDDevice) -> Int {
        Int(bitPattern: Unmanaged.passUnretained(device).toOpaque())
    }

    private static func currentBootSessionID() -> String {
        var bootTime = timeval()
        var size = MemoryLayout<timeval>.size
        if sysctlbyname("kern.boottime", &bootTime, &size, nil, 0) == 0 {
            return "\(bootTime.tv_sec):\(bootTime.tv_usec)"
        }
        return UUID().uuidString
    }
}

private func nowMS() -> Int64 {
    Int64(Date().timeIntervalSince1970 * 1_000)
}

private func runSelfTest() -> Never {
    let identity = HIDIdentityResolver.resolve(
        vendorID: 1,
        productID: 2,
        serial: "must-not-appear",
        physicalUniqueID: nil,
        locationID: nil,
        registryEntryID: 3,
        bootSessionID: "boot"
    )
    var tracker = HIDLearningTracker(minimumTransitionIntervalMS: 0)
    _ = tracker.observe(deviceID: identity.id, elementID: "element_test", previousValue: 1, value: 0, occurredAtMS: 1)
    _ = tracker.observe(deviceID: identity.id, elementID: "element_test", previousValue: 0, value: 1, occurredAtMS: 2)
    _ = tracker.observe(deviceID: identity.id, elementID: "element_test", previousValue: 1, value: 0, occurredAtMS: 3)
    let complete = tracker.observe(deviceID: identity.id, elementID: "element_test", previousValue: 0, value: 1, occurredAtMS: 4)
    let passed: Bool
    if case .complete = complete {
        passed = identity.quality == .serial && !identity.id.contains("must-not-appear")
    } else {
        passed = false
    }
    let output: JSON = ["protocolVersion": HIDProtocol.version, "ok": passed]
    if let data = try? HIDProtocol.boundedJSONLine(output) { FileHandle.standardOutput.write(data) }
    Darwin.exit(passed ? 0 : 1)
}

let arguments = Set(CommandLine.arguments.dropFirst())
if arguments.contains("--self-test") { runSelfTest() }
guard arguments.contains("--stdio") else {
    FileHandle.standardError.write(Data("relight-hid-bridge requires --stdio\n".utf8))
    Darwin.exit(64)
}
private let bridge = HIDBridge()
bridge.run()
