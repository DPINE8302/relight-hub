namespace RELight.Core;

public enum EffectParameter
{
    Level,
    LowPassHz,
    DelayMs,
    DelayWet,
    Feedback,
    ReverbWet,
    Distortion,
    Pan
}

public static class EffectParameterInfo
{
    public static readonly EffectParameter[] All =
    [
        EffectParameter.Level,
        EffectParameter.LowPassHz,
        EffectParameter.DelayMs,
        EffectParameter.DelayWet,
        EffectParameter.Feedback,
        EffectParameter.ReverbWet,
        EffectParameter.Distortion,
        EffectParameter.Pan
    ];

    public static string JsonName(EffectParameter parameter) => parameter switch
    {
        EffectParameter.Level => "level",
        EffectParameter.LowPassHz => "lowPassHz",
        EffectParameter.DelayMs => "delayMs",
        EffectParameter.DelayWet => "delayWet",
        EffectParameter.Feedback => "feedback",
        EffectParameter.ReverbWet => "reverbWet",
        EffectParameter.Distortion => "distortion",
        EffectParameter.Pan => "pan",
        _ => throw new ArgumentOutOfRangeException(nameof(parameter))
    };

    public static bool TryParse(string name, out EffectParameter parameter)
    {
        switch (name)
        {
            case "level": parameter = EffectParameter.Level; return true;
            case "lowPassHz": parameter = EffectParameter.LowPassHz; return true;
            case "delayMs": parameter = EffectParameter.DelayMs; return true;
            case "delayWet": parameter = EffectParameter.DelayWet; return true;
            case "feedback": parameter = EffectParameter.Feedback; return true;
            case "reverbWet": parameter = EffectParameter.ReverbWet; return true;
            case "distortion": parameter = EffectParameter.Distortion; return true;
            case "pan": parameter = EffectParameter.Pan; return true;
            default: parameter = default; return false;
        }
    }
}

/// <summary>
/// Per-cue effect settings. The optional delay wet value keeps legacy schema-1
/// projects on their original 30 % echo mix.
/// </summary>
public sealed class EffectSettings : IEquatable<EffectSettings>
{
    public double Level { get; set; } = 0.8;
    public double LowPassHz { get; set; } = 18000;
    public double DelayMs { get; set; }
    public double? DelayWet { get; set; }
    public double Feedback { get; set; }
    public double ReverbWet { get; set; }
    public double Distortion { get; set; }
    public double Pan { get; set; }

    public double this[EffectParameter parameter]
    {
        get => parameter switch
        {
            EffectParameter.Level => Level,
            EffectParameter.LowPassHz => LowPassHz,
            EffectParameter.DelayMs => DelayMs,
            EffectParameter.DelayWet => DelayWet ?? 0.3,
            EffectParameter.Feedback => Feedback,
            EffectParameter.ReverbWet => ReverbWet,
            EffectParameter.Distortion => Distortion,
            EffectParameter.Pan => Pan,
            _ => throw new ArgumentOutOfRangeException(nameof(parameter))
        };
        set
        {
            switch (parameter)
            {
                case EffectParameter.Level: Level = value; break;
                case EffectParameter.LowPassHz: LowPassHz = value; break;
                case EffectParameter.DelayMs: DelayMs = value; break;
                case EffectParameter.DelayWet: DelayWet = value; break;
                case EffectParameter.Feedback: Feedback = value; break;
                case EffectParameter.ReverbWet: ReverbWet = value; break;
                case EffectParameter.Distortion: Distortion = value; break;
                case EffectParameter.Pan: Pan = value; break;
                default: throw new ArgumentOutOfRangeException(nameof(parameter));
            }
        }
    }

    public static (double Min, double Max) Range(EffectParameter parameter) => parameter switch
    {
        EffectParameter.Level or EffectParameter.DelayWet or EffectParameter.ReverbWet or EffectParameter.Distortion => (0, 1),
        EffectParameter.LowPassHz => (120, 20000),
        EffectParameter.DelayMs => (0, 2000),
        EffectParameter.Feedback => (0, 0.38),
        EffectParameter.Pan => (-1, 1),
        _ => throw new ArgumentOutOfRangeException(nameof(parameter))
    };

    public static EffectSettings Preset(string name)
    {
        var effects = new EffectSettings();
        switch (name)
        {
            case "Echo":
                effects.DelayMs = 280;
                effects.Feedback = 0.22;
                effects.ReverbWet = 0.18;
                effects.LowPassHz = 5200;
                break;
            case "Decay":
                effects.DelayMs = 320;
                effects.Feedback = 0.30;
                effects.ReverbWet = 0.35;
                effects.LowPassHz = 2400;
                break;
            case "Distorted":
                effects.DelayMs = 210;
                effects.Feedback = 0.16;
                effects.Distortion = 0.25;
                effects.LowPassHz = 2400;
                break;
        }

        return effects;
    }

    public EffectSettings Clone() => new()
    {
        Level = Level,
        LowPassHz = LowPassHz,
        DelayMs = DelayMs,
        DelayWet = DelayWet,
        Feedback = Feedback,
        ReverbWet = ReverbWet,
        Distortion = Distortion,
        Pan = Pan
    };

    public bool Equals(EffectSettings? other) =>
        other is not null &&
        Level == other.Level &&
        LowPassHz == other.LowPassHz &&
        DelayMs == other.DelayMs &&
        DelayWet == other.DelayWet &&
        Feedback == other.Feedback &&
        ReverbWet == other.ReverbWet &&
        Distortion == other.Distortion &&
        Pan == other.Pan;

    public override bool Equals(object? obj) => Equals(obj as EffectSettings);

    public override int GetHashCode() => HashCode.Combine(
        Level, LowPassHz, DelayMs, DelayWet, Feedback, ReverbWet, Distortion, Pan);
}

public sealed class AutomationPoint : IEquatable<AutomationPoint>
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public long Frame { get; set; }
    public double Value { get; set; }

    public AutomationPoint()
    {
    }

    public AutomationPoint(long frame, double value)
    {
        Frame = frame;
        Value = value;
    }

    public AutomationPoint Clone() => new(Frame, Value) { Id = Id };

    public bool Equals(AutomationPoint? other) =>
        other is not null && Id == other.Id && Frame == other.Frame && Value == other.Value;

    public override bool Equals(object? obj) => Equals(obj as AutomationPoint);

    public override int GetHashCode() => HashCode.Combine(Id, Frame, Value);
}
