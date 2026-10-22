namespace RELight.Media;

public sealed record VideoTrackInfo(
    string Codec,
    int Width,
    int Height,
    double FrameRate,
    double DurationSeconds,
    long SampleCount,
    long KeyframeCount,
    bool VariableFrameRate,
    int Timescale);

public sealed record AudioTrackInfo(
    string Codec,
    int SampleRate,
    int Channels,
    double DurationSeconds,
    long SampleCount,
    int Timescale);

public sealed record MediaInfo(
    string Path,
    string MajorBrand,
    IReadOnlyList<string> CompatibleBrands,
    double DurationSeconds,
    bool Fragmented,
    VideoTrackInfo? Video,
    AudioTrackInfo? Audio);
