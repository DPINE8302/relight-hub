namespace RELight.Core;

public sealed class VoiceCue : IEquatable<VoiceCue>
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "Visitor voice";
    public long StartFrame { get; set; }
    public long LengthFrames { get; set; } = 144;
    public long SourceInFrame { get; set; }
    public long FadeInFrames { get; set; } = 2;
    public long FadeOutFrames { get; set; } = 6;
    public bool Bypass { get; set; }
    public long? RepeatCount { get; set; }
    public bool? LoopToFill { get; set; }
    public EffectSettings Effects { get; set; } = new();
    public Dictionary<string, List<AutomationPoint>> Automation { get; set; } = new(StringComparer.Ordinal);

    public VoiceCue()
    {
    }

    public VoiceCue(long startFrame = 0, long lengthFrames = 144)
    {
        StartFrame = startFrame;
        LengthFrames = lengthFrames;
    }

    public bool RepeatsSource => LoopToFill == true || (RepeatCount ?? 1) > 1;

    /// <summary>
    /// Automates an effect parameter at a scene-local frame. Matches the Swift
    /// interpolation: hold the first value before the first point, linearly
    /// interpolate between points, hold the last value afterwards.
    /// </summary>
    public double Value(EffectParameter parameter, long frame)
    {
        var key = EffectParameterInfo.JsonName(parameter);
        if (!Automation.TryGetValue(key, out var points) || points.Count == 0)
        {
            return Effects[parameter];
        }

        var sorted = points.OrderBy(point => point.Frame).ToArray();
        var first = sorted[0];
        if (frame <= first.Frame)
        {
            return first.Value;
        }

        for (var i = 1; i < sorted.Length; i++)
        {
            var previous = sorted[i - 1];
            var next = sorted[i];
            if (frame <= next.Frame)
            {
                var distance = Math.Max(1L, next.Frame - previous.Frame);
                var t = (double)(frame - previous.Frame) / distance;
                return previous.Value + (next.Value - previous.Value) * t;
            }
        }

        return sorted[^1].Value;
    }

    public long PlaybackFrame(double sceneSeconds, FrameRate rate, double voiceAdvanceMs, double speed = 1) =>
        rate.Frame(sceneSeconds - rate.Seconds(StartFrame) + voiceAdvanceMs / 1000.0 * speed);

    public double Envelope(long frame)
    {
        if (frame < 0 || frame >= LengthFrames)
        {
            return 0;
        }

        var fadeIn = FadeInFrames > 0 ? Math.Min(1, (double)frame / FadeInFrames) : 1;
        var fadeOut = FadeOutFrames > 0 ? Math.Min(1, (double)(LengthFrames - frame) / FadeOutFrames) : 1;
        return Math.Min(fadeIn, fadeOut);
    }

    public VoiceCue Clone()
    {
        var clone = new VoiceCue
        {
            Id = Id,
            Name = Name,
            StartFrame = StartFrame,
            LengthFrames = LengthFrames,
            SourceInFrame = SourceInFrame,
            FadeInFrames = FadeInFrames,
            FadeOutFrames = FadeOutFrames,
            Bypass = Bypass,
            RepeatCount = RepeatCount,
            LoopToFill = LoopToFill,
            Effects = Effects.Clone()
        };

        foreach (var (key, points) in Automation)
        {
            clone.Automation[key] = points.Select(point => point.Clone()).ToList();
        }

        return clone;
    }

    public bool Equals(VoiceCue? other)
    {
        if (other is null)
        {
            return false;
        }

        if (Id != other.Id ||
            !string.Equals(Name, other.Name, StringComparison.Ordinal) ||
            StartFrame != other.StartFrame ||
            LengthFrames != other.LengthFrames ||
            SourceInFrame != other.SourceInFrame ||
            FadeInFrames != other.FadeInFrames ||
            FadeOutFrames != other.FadeOutFrames ||
            Bypass != other.Bypass ||
            RepeatCount != other.RepeatCount ||
            LoopToFill != other.LoopToFill ||
            !Effects.Equals(other.Effects) ||
            Automation.Count != other.Automation.Count)
        {
            return false;
        }

        foreach (var (key, points) in Automation)
        {
            if (!other.Automation.TryGetValue(key, out var otherPoints) || !points.SequenceEqual(otherPoints))
            {
                return false;
            }
        }

        return true;
    }

    public override bool Equals(object? obj) => Equals(obj as VoiceCue);

    public override int GetHashCode()
    {
        var hash = new HashCode();
        hash.Add(Id);
        hash.Add(Name, StringComparer.Ordinal);
        hash.Add(StartFrame);
        hash.Add(LengthFrames);
        hash.Add(SourceInFrame);
        hash.Add(FadeInFrames);
        hash.Add(FadeOutFrames);
        hash.Add(Bypass);
        hash.Add(RepeatCount);
        hash.Add(LoopToFill);
        hash.Add(Effects);
        foreach (var key in Automation.Keys.OrderBy(key => key, StringComparer.Ordinal))
        {
            hash.Add(key, StringComparer.Ordinal);
            foreach (var point in Automation[key])
            {
                hash.Add(point);
            }
        }

        return hash.ToHashCode();
    }
}
