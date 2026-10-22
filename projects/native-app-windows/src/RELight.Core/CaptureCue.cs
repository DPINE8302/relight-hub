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
}

public sealed class CaptureCue : IEquatable<CaptureCue>
{
    public const double ManualLimitSeconds = 600;

    public CaptureMode? Mode { get; set; }
    public long? GateFrame { get; set; }
    public CaptureTrigger Trigger { get; set; } = CaptureTrigger.Gate;
    public long StartFrame { get; set; }
    public double DurationSeconds { get; set; } = 6;

    public CaptureMode RecordingMode => Mode ?? CaptureMode.Timed;

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
        Mode = Mode,
        GateFrame = GateFrame,
        Trigger = Trigger,
        StartFrame = StartFrame,
        DurationSeconds = DurationSeconds
    };

    public bool Equals(CaptureCue? other) =>
        other is not null &&
        Mode == other.Mode &&
        GateFrame == other.GateFrame &&
        Trigger == other.Trigger &&
        StartFrame == other.StartFrame &&
        DurationSeconds == other.DurationSeconds;

    public override bool Equals(object? obj) => Equals(obj as CaptureCue);

    public override int GetHashCode() =>
        HashCode.Combine(Mode, GateFrame, Trigger, StartFrame, DurationSeconds);
}
