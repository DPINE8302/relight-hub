import Foundation

public struct HIDLearnElement: Equatable, Sendable {
    public let deviceID: String
    public let elementID: String
    public let releasedValue: Int
    public let pressedValue: Int

    public init(deviceID: String, elementID: String, releasedValue: Int, pressedValue: Int) {
        self.deviceID = deviceID
        self.elementID = elementID
        self.releasedValue = releasedValue
        self.pressedValue = pressedValue
    }
}

public enum HIDLearningUpdate: Equatable, Sendable {
    case ignored
    case firstPress(HIDLearnElement)
    case progress(HIDLearnElement, completedPresses: Int)
    case complete(HIDLearnElement)
}

public struct HIDLearningTracker: Sendable {
    public let minimumTransitionIntervalMS: Int64
    private(set) public var candidate: HIDLearnElement?
    private(set) public var completedPresses = 0
    private var awaitingRelease = false
    private var lastTransitionAtMS: Int64?

    public init(minimumTransitionIntervalMS: Int64 = 35) {
        self.minimumTransitionIntervalMS = minimumTransitionIntervalMS
    }

    public mutating func observe(
        deviceID: String,
        elementID: String,
        previousValue: Int,
        value: Int,
        occurredAtMS: Int64
    ) -> HIDLearningUpdate {
        guard value != previousValue else { return .ignored }
        if let lastTransitionAtMS,
           occurredAtMS - lastTransitionAtMS < minimumTransitionIntervalMS {
            return .ignored
        }

        if candidate == nil {
            let selected = HIDLearnElement(
                deviceID: deviceID,
                elementID: elementID,
                releasedValue: previousValue,
                pressedValue: value
            )
            candidate = selected
            awaitingRelease = true
            lastTransitionAtMS = occurredAtMS
            return .firstPress(selected)
        }

        guard let candidate,
              candidate.deviceID == deviceID,
              candidate.elementID == elementID else {
            return .ignored
        }

        if awaitingRelease {
            guard value == candidate.releasedValue else { return .ignored }
            completedPresses += 1
            awaitingRelease = false
            lastTransitionAtMS = occurredAtMS
            if completedPresses >= 2 { return .complete(candidate) }
            return .progress(candidate, completedPresses: completedPresses)
        }

        guard value == candidate.pressedValue else { return .ignored }
        awaitingRelease = true
        lastTransitionAtMS = occurredAtMS
        return .progress(candidate, completedPresses: completedPresses)
    }
}
