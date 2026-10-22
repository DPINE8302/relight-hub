using RELight.Studio;

namespace RELight.Windows;

/// <summary>
/// Per-machine device assignments stored under <see cref="WindowsAppPaths.SupportRoot"/>.
/// The on-disk format and behavior live in the portable
/// <see cref="DeviceSettingsStore"/> so they can be tested without Windows.
/// </summary>
public static class WindowsSettingsStore
{
    public static DeviceSettings Load() => Store.Load();

    public static void Save(DeviceSettings settings) => Store.Save(settings);

    private static DeviceSettingsStore Store => new(WindowsAppPaths.SupportRoot);
}
