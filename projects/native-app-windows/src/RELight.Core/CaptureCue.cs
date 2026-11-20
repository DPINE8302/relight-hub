namespace RELight.Core;

public enum CaptureTrigger
{
    Gate,
    Automatic
}

public enum CaptureMode
{
    Timed,
    Manual
}

public enum CaptureStartMethod
{
    Button,
    Countdown,
    Narrator
}

public static class CaptureNames
{
    public static string JsonName(CaptureTrigger trigger) => trigger switch
    {
        CaptureTrigger.Gate => "gate",
        CaptureTrigger.Automatic => "automatic",
        _ => throw new ArgumentOutOfRangeException(nameof(trigger))
    };

    public static string JsonName(CaptureMode mode) => mode switch
    {
        CaptureMode.Timed => "timed",
        CaptureMode.Manual => "manual",
        _ => throw new ArgumentOutOfRangeException(nameof(mode))
    };

    public static bool TryParse(string value, out CaptureTrigger trigger)
    {
        switch (value)
        {
            case "gate": trigger = CaptureTrigger.Gate; return true;
            case "automatic": trigger = CaptureTrigger.Automatic; return true;
            default: trigger = default; return false;
        }
    }

    public static bool TryParse(string value, out CaptureMode mode)
    {
        switch (value)
        {
            case "timed": mode = CaptureMode.Timed; return true;
            case "manual": mode = CaptureMode.Manual; return true;
            default: mode = default; return false;
        }
    }

    public static string JsonName(CaptureStartMethod method) => method switch
    {
        CaptureStartMethod.Button => "button",
        CaptureStartMethod.Countdown => "countdown",
        CaptureStartMethod.Narrator => "narrator",
        _ => throw new ArgumentOutOfRangeException(nameof(method))
    };

    public static bool TryParse(string value, out CaptureStartMethod method)
    {
        switch (value)
        {
            case "button": method = CaptureStartMethod.Button; return true;
            case "countdown": method = CaptureStartMethod.Countdown; return true;
            case "narrator": method = CaptureStartMethod.Narrator; return true;
            default: method = default; return false;
        }
    }
}

public sealed class CaptureCue : IEquatable<CaptureCue>
{
    public const double ManualLimitSeconds = 600;

    public CaptureStartMethod? StartMethod { get; set; }
    public int? CountdownSeconds { get; set; }
    public string? Narrator { get; set; }
    public bool? NarratorMuted { get; set; }
    public CaptureMode? Mode { get; set; }
    public long? GateFrame { get; set; }
    public CaptureTrigger Trigger { get; set; } = CaptureTrigger.Gate;
    public long StartFrame { get; set; }
    public double DurationSeconds { get; set; } = 6;

    public CaptureMode RecordingMode => Mode ?? CaptureMode.Timed;
    public CaptureStartMethod RecordingStartMethod => StartMethod ?? CaptureStartMethod.Button;
    public int DelaySeconds => CountdownSeconds ?? 3;

    public CaptureCue()
    {
    }

    public CaptureCue(CaptureTrigger trigger = CaptureTrigger.Gate, long startFrame = 0, double durationSeconds = 6)
    {
        Trigger = trigger;
        StartFrame = startFrame;
        DurationSeconds = durationSeconds;
    }

    public CaptureCue Clone() => new()
    {
        StartMethod = StartMethod,
        CountdownSeconds = CountdownSeconds,
        Narrator = Narrator,
        NarratorMuted = NarratorMuted,
        Mode = Mode,
        GateFrame = GateFrame,
        Trigger = Trigger,
        StartFrame = StartFrame,
        DurationSeconds = DurationSeconds
    };

    public bool Equals(CaptureCue? other) =>
        other is not null &&
        StartMethod == other.StartMethod &&
        CountdownSeconds == other.CountdownSeconds &&
        string.Equals(Narrator, other.Narrator, StringComparison.Ordinal) &&
        NarratorMuted == other.NarratorMuted &&
        Mode == other.Mode &&
        GateFrame == other.GateFrame &&
        Trigger == other.Trigger &&
        StartFrame == other.StartFrame &&
        DurationSeconds == other.DurationSeconds;

    public override bool Equals(object? obj) => Equals(obj as CaptureCue);

    public override int GetHashCode()
    {
        var hash = new HashCode();
        hash.Add(StartMethod);
        hash.Add(CountdownSeconds);
        hash.Add(Narrator, StringComparer.Ordinal);
        hash.Add(NarratorMuted);
        hash.Add(Mode);
        hash.Add(GateFrame);
        hash.Add(Trigger);
        hash.Add(StartFrame);
        hash.Add(DurationSeconds);
        return hash.ToHashCode();
    }
}
