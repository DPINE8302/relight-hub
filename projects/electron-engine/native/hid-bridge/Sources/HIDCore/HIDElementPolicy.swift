import Foundation

public enum HIDElementPolicy {
    public static let genericDesktopPage = 0x01
    public static let keyboardOrKeypadPage = 0x07
    public static let buttonPage = 0x09
    public static let sensorPage = 0x20
    public static let mouseUsage = 0x02
    public static let keyboardUsage = 0x06
    public static let keypadUsage = 0x07

    public static func deviceIsMouse(usagePage: Int, usage: Int) -> Bool {
        usagePage == genericDesktopPage && usage == mouseUsage
    }

    public static func deviceIsSensor(usagePage: Int) -> Bool {
        usagePage == sensorPage
    }

    public static func isAssignable(
        deviceUsagePage: Int,
        deviceUsage: Int,
        elementUsagePage: Int,
        elementUsage: Int,
        isInput: Bool,
        logicalMinimum: Int,
        logicalMaximum: Int
    ) -> Bool {
        guard isInput else { return false }
        guard !deviceIsMouse(usagePage: deviceUsagePage, usage: deviceUsage) else { return false }
        guard !deviceIsSensor(usagePage: deviceUsagePage) else { return false }
        guard logicalMaximum > logicalMinimum, logicalMaximum - logicalMinimum == 1 else { return false }

        if elementUsagePage == buttonPage {
            return elementUsage > 0
        }
        if elementUsagePage == keyboardOrKeypadPage {
            // 0-3 are reserved/error usages; E0-E7 are modifiers and cannot be assigned.
            return elementUsage >= 4 && !(0xE0...0xE7).contains(elementUsage)
        }
        return false
    }

    public static func genericElementLabel(usagePage: Int, usage: Int) -> String {
        if usagePage == buttonPage { return "Button \(usage)" }
        return "Keyboard control \(usage)"
    }
}
