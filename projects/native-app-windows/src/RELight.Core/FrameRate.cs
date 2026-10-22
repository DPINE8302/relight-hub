using System.Globalization;

namespace RELight.Core;

/// <summary>
/// Frame rate and frame/time conversion. Mirrors <c>FrameRate</c> in the Swift core.
/// </summary>
public sealed class FrameRate : IEquatable<FrameRate>
{
    public long Numerator { get; set; } = 24;
    public long Denominator { get; set; } = 1;

    public FrameRate()
    {
    }

    public FrameRate(long numerator, long denominator = 1)
    {
        Numerator = numerator;
        Denominator = denominator;
    }

    public double Fps => (double)Numerator / Math.Max(1L, Denominator);

    public double Seconds(long frame) => frame / Fps;

    public long Frame(double seconds)
    {
        var value = seconds * Fps + 0.0000001;
        if (double.IsNaN(value) || double.IsInfinity(value))
        {
            throw new ArgumentOutOfRangeException(nameof(seconds), "Frame time is not finite.");
        }

        return (long)Math.Floor(value);
    }

    public string Timecode(long frame)
    {
        var rate = Math.Max(1L, (long)Math.Round(Fps, MidpointRounding.AwayFromZero));
        var f = Math.Max(0L, frame);
        var hours = f / (rate * 3600);
        var minutes = f / (rate * 60) % 60;
        var seconds = f / rate % 60;
        var frames = f % rate;
        return string.Format(
            CultureInfo.InvariantCulture,
            "{0:00}:{1:00}:{2:00}:{3:00}",
            hours,
            minutes,
            seconds,
            frames);
    }

    public FrameRate Clone() => new(Numerator, Denominator);

    public bool Equals(FrameRate? other) =>
        other is not null && Numerator == other.Numerator && Denominator == other.Denominator;

    public override bool Equals(object? obj) => Equals(obj as FrameRate);

    public override int GetHashCode() => HashCode.Combine(Numerator, Denominator);
}
