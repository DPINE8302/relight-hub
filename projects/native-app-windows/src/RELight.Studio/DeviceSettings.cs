using System.Text.Json;

namespace RELight.Studio;

/// <summary>
/// Per-machine device assignments. This state lives outside projects and never
/// participates in a .relight export.
/// </summary>
public sealed record DeviceSettings(string InputUid, string OutputUid, string ScreenId)
{
    public static DeviceSettings Empty { get; } = new("", "", "");
}

/// <summary>
/// Portable JSON persistence for <see cref="DeviceSettings"/>. The caller owns
/// the support directory so this class can be exercised without touching a
/// user's real application data.
/// </summary>
public sealed class DeviceSettingsStore
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public DeviceSettingsStore(string supportRoot)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(supportRoot);
        SupportRoot = Path.GetFullPath(supportRoot);
        FilePath = Path.Combine(SupportRoot, "devices.json");
    }

    public string SupportRoot { get; }

    public string FilePath { get; }

    public DeviceSettings Load()
    {
        try
        {
            if (!File.Exists(FilePath))
            {
                return DeviceSettings.Empty;
            }

            return JsonSerializer.Deserialize<DeviceSettings>(File.ReadAllText(FilePath), Options)
                is { InputUid: not null, OutputUid: not null, ScreenId: not null } settings
                ? settings
                : DeviceSettings.Empty;
        }
        catch (Exception exception) when (
            exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return DeviceSettings.Empty;
        }
    }

    public void Save(DeviceSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        Directory.CreateDirectory(SupportRoot);
        var temporary = FilePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllText(temporary, JsonSerializer.Serialize(settings, Options));
            File.Move(temporary, FilePath, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporary))
            {
                File.Delete(temporary);
            }
        }
    }
}
