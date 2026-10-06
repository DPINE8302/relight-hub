import Foundation
import Testing
@testable import HIDCore

@Test func identityUsesTheStrongestAvailableSourceWithoutLeakingIt() {
    let identity = HIDIdentityResolver.resolve(
        vendorID: 123,
        productID: 456,
        serial: "PRIVATE-SERIAL",
        physicalUniqueID: "private-physical",
        locationID: "private-port",
        registryEntryID: 99,
        bootSessionID: "private-boot"
    )
    #expect(identity.quality == .serial)
    #expect(identity.id.hasPrefix("hid_"))
    #expect(!identity.id.contains("PRIVATE"))
    #expect(!identity.locationBound)
}

@Test func identityFallsBackToPortAndThenSession() {
    let port = HIDIdentityResolver.resolve(
        vendorID: 1, productID: 2, serial: nil, physicalUniqueID: nil,
        locationID: "0x123", registryEntryID: 3, bootSessionID: "boot"
    )
    #expect(port.quality == .port)
    #expect(port.locationBound)
    #expect(port.note == "Bound to this USB port")

    let session = HIDIdentityResolver.resolve(
        vendorID: 1, productID: 2, serial: nil, physicalUniqueID: nil,
        locationID: nil, registryEntryID: 3, bootSessionID: "boot"
    )
    #expect(session.quality == .session)
    #expect(!session.locationBound)
}

@Test func compositeCollectionsGroupUnderOneDeviceButKeepDistinctElements() {
    let first = HIDIdentityResolver.resolve(
        vendorID: 1, productID: 2, serial: "shared-device", physicalUniqueID: nil,
        locationID: "port", registryEntryID: 10, bootSessionID: "boot"
    )
    let second = HIDIdentityResolver.resolve(
        vendorID: 1, productID: 2, serial: "shared-device", physicalUniqueID: nil,
        locationID: "port", registryEntryID: 11, bootSessionID: "boot"
    )
    #expect(first.id == second.id)
    let keyboard = HIDIdentityResolver.elementID(
        deviceID: first.id, cookie: 1, usagePage: 7, usage: 4, reportID: 0,
        collectionUsagePage: 1, collectionUsage: 6
    )
    let keypad = HIDIdentityResolver.elementID(
        deviceID: first.id, cookie: 1, usagePage: 7, usage: 4, reportID: 0,
        collectionUsagePage: 1, collectionUsage: 7
    )
    #expect(keyboard != keypad)
}

@Test func elementPolicyAllowsBinaryKeysAndButtonsButNotModifiersAxesOrMice() {
    #expect(HIDElementPolicy.isAssignable(
        deviceUsagePage: 1, deviceUsage: 6, elementUsagePage: 7, elementUsage: 4,
        isInput: true, logicalMinimum: 0, logicalMaximum: 1
    ))
    #expect(HIDElementPolicy.isAssignable(
        deviceUsagePage: 1, deviceUsage: 0, elementUsagePage: 9, elementUsage: 1,
        isInput: true, logicalMinimum: 1, logicalMaximum: 2
    ))
    #expect(!HIDElementPolicy.isAssignable(
        deviceUsagePage: 1, deviceUsage: 6, elementUsagePage: 7, elementUsage: 0xE1,
        isInput: true, logicalMinimum: 0, logicalMaximum: 1
    ))
    #expect(!HIDElementPolicy.isAssignable(
        deviceUsagePage: 1, deviceUsage: 6, elementUsagePage: 1, elementUsage: 0x30,
        isInput: true, logicalMinimum: -127, logicalMaximum: 127
    ))
    #expect(!HIDElementPolicy.isAssignable(
        deviceUsagePage: 1, deviceUsage: 2, elementUsagePage: 9, elementUsage: 1,
        isInput: true, logicalMinimum: 0, logicalMaximum: 1
    ))
    #expect(!HIDElementPolicy.isAssignable(
        deviceUsagePage: 0x20, deviceUsage: 1, elementUsagePage: 9, elementUsage: 1,
        isInput: true, logicalMinimum: 0, logicalMaximum: 1
    ))
}

@Test func learningRequiresTwoCompleteCyclesAndHandlesActiveLowControls() {
    var tracker = HIDLearningTracker(minimumTransitionIntervalMS: 20)
    let first = tracker.observe(
        deviceID: "hid_a", elementID: "element_a", previousValue: 1, value: 0, occurredAtMS: 100
    )
    #expect(first == .firstPress(.init(deviceID: "hid_a", elementID: "element_a", releasedValue: 1, pressedValue: 0)))
    #expect(tracker.observe(
        deviceID: "hid_a", elementID: "element_a", previousValue: 0, value: 1, occurredAtMS: 150
    ) == .progress(.init(deviceID: "hid_a", elementID: "element_a", releasedValue: 1, pressedValue: 0), completedPresses: 1))
    _ = tracker.observe(
        deviceID: "hid_a", elementID: "element_a", previousValue: 1, value: 0, occurredAtMS: 200
    )
    #expect(tracker.observe(
        deviceID: "hid_a", elementID: "element_a", previousValue: 0, value: 1, occurredAtMS: 250
    ) == .complete(.init(deviceID: "hid_a", elementID: "element_a", releasedValue: 1, pressedValue: 0)))
}

@Test func learningIgnoresHeldValuesOtherElementsAndBounce() {
    var tracker = HIDLearningTracker(minimumTransitionIntervalMS: 40)
    #expect(tracker.observe(
        deviceID: "hid_a", elementID: "element_a", previousValue: 0, value: 0, occurredAtMS: 100
    ) == .ignored)
    _ = tracker.observe(
        deviceID: "hid_a", elementID: "element_a", previousValue: 0, value: 1, occurredAtMS: 120
    )
    #expect(tracker.observe(
        deviceID: "hid_a", elementID: "element_a", previousValue: 1, value: 0, occurredAtMS: 130
    ) == .ignored)
    #expect(tracker.observe(
        deviceID: "hid_b", elementID: "element_b", previousValue: 0, value: 1, occurredAtMS: 200
    ) == .ignored)
}

@Test func lineReaderBoundsInputAndRecoversAtTheNextNewline() {
    var reader = BoundedLineReader()
    let oversized = Data(repeating: 65, count: HIDProtocol.maximumLineBytes + 1) + Data([0x0A])
    let first = reader.append(oversized)
    #expect(first.oversizedLine)
    #expect(first.lines.isEmpty)
    let second = reader.append(Data("{}\n".utf8))
    #expect(second.lines == [Data("{}".utf8)])
}
