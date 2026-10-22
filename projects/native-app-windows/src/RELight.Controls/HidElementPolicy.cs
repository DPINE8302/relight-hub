namespace RELight.Controls;

/// <summary>
/// Port of the Mac helper's HID element policy. Only binary input elements on
/// buttons or keyboard/keypad usages are assignable. Modifiers, axes, mice and
/// sensors are deliberately excluded, as are all output elements.
/// </summary>
public static class HidElementPolicy
{
    public const int GenericDesktopPage = 0x01;
    public const int KeyboardOrKeypadPage = 0x07;
    public const int ButtonPage = 0x09;
    public const int SensorPage = 0x20;
    public const int MouseUsage = 0x02;
    public const int KeyboardUsage = 0x06;
    public const int KeypadUsage = 0x07;

    public static bool DeviceIsMouse(int usagePage, int usage) =>
        usagePage == GenericDesktopPage && usage == MouseUsage;

    public static bool DeviceIsSensor(int usagePage) => usagePage == SensorPage;

    public static bool IsAssignable(
        int deviceUsagePage,
        int deviceUsage,
        int elementUsagePage,
        int elementUsage,
        bool isInput,
        int logicalMinimum,
        int logicalMaximum)
    {
        if (!isInput)
        {
            return false;
        }

        if (DeviceIsMouse(deviceUsagePage, deviceUsage) || DeviceIsSensor(deviceUsagePage))
        {
            return false;
        }

        if (logicalMaximum <= logicalMinimum || logicalMaximum - logicalMinimum != 1)
        {
            return false;
        }

        return elementUsagePage switch
        {
            ButtonPage => elementUsage > 0,
            KeyboardOrKeypadPage => elementUsage >= 4 && elementUsage is < 0xE0 or > 0xE7,
            _ => false
        };
    }

    public static string GenericElementLabel(int usagePage, int usage) =>
        usagePage == ButtonPage ? $"Button {usage}" : $"Keyboard control {usage}";
}
