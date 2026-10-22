using System.Text.Json;

namespace RELight.Studio;

/// <summary>
/// Per-machine exhibition calibration. It is stored outside projects so a
/// measured speaker/projector delay never changes the portable
/// <c>Project.OutputOffsetMs</c> an author wrote.
/// </summary>
public sealed record MachineCalibration(double VoiceAdvanceMs)
{
    public const double MinimumVoiceAdvanceMs = -1_000;
    public const double MaximumVoiceAdvanceMs = 1_000;

    public static MachineCalibration Empty { get; } = new(0);

    public bool IsValid =>
        double.IsFinite(VoiceAdvanceMs) &&
        VoiceAdvanceMs is >= MinimumVoiceAdvanceMs and <= MaximumVoiceAdvanceMs;
}

/// <summary>
/// Portable JSON persistence for <see cref="MachineCalibration"/>. The caller
/// supplies the support directory, which keeps tests away from real app data.
/// A missing, malformed or out-of-range file fails closed to zero advance.
/// </summary>
public sealed class CalibrationStore
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public CalibrationStore(string supportRoot)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(supportRoot);
        SupportRoot = Path.GetFullPath(supportRoot);
        FilePath = Path.Combine(SupportRoot, "calibration.json");
    }

    public string SupportRoot { get; }

    public string FilePath { get; }

    public MachineCalibration Load()
    {
        try
        {
            if (!File.Exists(FilePath))
            {
                return MachineCalibration.Empty;
            }

            return JsonSerializer.Deserialize<MachineCalibration>(File.ReadAllText(FilePath), Options)
                is { } calibration && calibration.IsValid
                ? calibration
                : MachineCalibration.Empty;
        }
        catch (Exception exception) when (
            exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return MachineCalibration.Empty;
        }
    }

    public void Save(MachineCalibration calibration)
    {
        ArgumentNullException.ThrowIfNull(calibration);
        if (!calibration.IsValid)
        {
            throw new ArgumentOutOfRangeException(
                nameof(calibration),
                "Voice advance must be between −1000 and 1000 ms.");
        }

        Directory.CreateDirectory(SupportRoot);
        var temporary = FilePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllText(temporary, JsonSerializer.Serialize(calibration, Options));
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
