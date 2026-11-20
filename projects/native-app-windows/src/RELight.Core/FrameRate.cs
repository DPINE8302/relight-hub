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

    public bool TryParseTimecode(string timecode, out long frame)
    {
        frame = 0;
        var parts = timecode.Trim().Split(':');
        var nominal = Math.Max(1L, (long)Math.Round(Fps, MidpointRounding.AwayFromZero));
        if (parts.Length != 4 ||
            !int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var hours) ||
            !int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var minutes) ||
            !int.TryParse(parts[2], NumberStyles.None, CultureInfo.InvariantCulture, out var seconds) ||
            !int.TryParse(parts[3], NumberStyles.None, CultureInfo.InvariantCulture, out var frames) ||
            hours > 1_000_000 || minutes >= 60 || seconds >= 60 || frames >= nominal)
        {
            return false;
        }

        frame = ((hours * 60L + minutes) * 60 + seconds) * nominal + frames;
        return true;
    }

    public FrameRate Clone() => new(Numerator, Denominator);

    public bool Equals(FrameRate? other) =>
        other is not null && Numerator == other.Numerator && Denominator == other.Denominator;

    public override bool Equals(object? obj) => Equals(obj as FrameRate);

    public override int GetHashCode() => HashCode.Combine(Numerator, Denominator);
}
