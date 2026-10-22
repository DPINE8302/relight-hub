namespace RELight.Core;

/// <summary>
/// The portable schema-1 project. This is a direct port of the Swift
/// <c>Project</c> model, including validation messages, optional-field
/// behavior and path containment rules.
/// </summary>
public sealed class Project : IEquatable<Project>
{
    public long SchemaVersion { get; set; } = 1;
    public string Title { get; set; } = "RE:Light";
    public FrameRate Rate { get; set; } = new();
    public double FilmLevel { get; set; } = 0.75;
    public double VoiceLevel { get; set; } = 0.85;
    public double DuckLevel { get; set; } = 0.35;
    public double OutputOffsetMs { get; set; }
    public Dictionary<string, EffectSettings> EffectPresets { get; set; } = new(StringComparer.Ordinal);
    public long? BlackFromFrame { get; set; } = 2808;
    public List<Scene> Scenes { get; set; } = [];

    public Project()
    {
    }

    public long TotalFrames
    {
        get
        {
            long total = 0;
            foreach (var scene in Scenes)
            {
                total = checked(total + scene.Frames);
            }

            return total;
        }
    }

    public long GlobalFrame(int scene, long localFrame)
    {
        if (scene < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(scene));
        }

        long total = 0;
        var count = Math.Min(scene, Scenes.Count);
        for (var i = 0; i < count; i++)
        {
            total = checked(total + Scenes[i].Frames);
        }

        return checked(total + localFrame);
    }

    /// <summary>
    /// Mirrors <c>Project.starter</c> in the Swift core. A new project (and new
    /// identifiers) is created on every call.
    /// </summary>
    public static Project CreateStarter() => new()
    {
        Scenes =
        [
            new Scene(
                "Memory",
                "ความทรงจำ",
                432,
                "media/Scene01_Draft1_480p_v5.mp4",
                new CaptureCue()),
            new Scene("Possibility", "ความเป็นไปได้", 648),
            new Scene("The Choice", "ทางเลือก", 528),
            new Scene(
                "Narrowing World / Hospital",
                "โลกแคบลง",
                936,
                cues: [new VoiceCue(744, 192)]),
            new Scene("Wake", "ตื่น", 336)
        ]
    };

    public List<string> Validation()
    {
        var issues = new List<string>();

        if (SchemaVersion != 1)
        {
            issues.Add("Unsupported project version");
        }

        var rate = Rate;
        if (rate.Numerator < 1 || rate.Numerator > 240000 ||
            rate.Denominator < 1 || rate.Denominator > 10000 ||
            rate.Fps > 240 || rate.Fps < 1)
        {
            issues.Add("Frame rate must be between 1 and 240 fps");
        }

        if (Scenes.Count == 0 || Scenes.Count > 100)
        {
            issues.Add("A project needs 1–100 scenes");
        }

        if (Scenes.Select(scene => scene.Id).Distinct().Count() != Scenes.Count)
        {
            issues.Add("Scene identifiers must be unique");
        }

        if (!double.IsFinite(FilmLevel) || FilmLevel < 0 || FilmLevel > 1 ||
            !double.IsFinite(VoiceLevel) || VoiceLevel < 0 || VoiceLevel > 1 ||
            !double.IsFinite(DuckLevel) || DuckLevel < 0 || DuckLevel > 1)
        {
            issues.Add("Mixer levels must be between 0 and 1");
        }

        if (!double.IsFinite(OutputOffsetMs) || OutputOffsetMs < -1000 || OutputOffsetMs > 1000)
        {
            issues.Add("Output offset must be between −1000 and 1000 ms");
        }

        if (!(Scenes.Count <= 100 && Scenes.All(scene =>
                scene.Frames is >= 1 and <= 1_000_000 &&
                scene.MediaInFrame is >= 0 and <= 1_000_000)))
        {
            issues.Add("Scene duration or media in-point exceeds supported limits");
            return issues;
        }

        if (!Scenes.All(scene =>
                scene.Cues.Count <= 100 &&
                scene.Cues.All(cue =>
                    cue.StartFrame is >= 0 and <= 1_000_000 &&
                    cue.LengthFrames is >= 1 and <= 1_000_000 &&
                    cue.SourceInFrame is >= 0 and <= 1_000_000 &&
                    cue.FadeInFrames is >= 0 and <= 1_000_000 &&
                    cue.FadeOutFrames is >= 0 and <= 1_000_000)))
        {
            issues.Add("Voice region or trim exceeds supported limits");
            return issues;
        }

        if (BlackFromFrame is long black && (black < 0 || black > TotalFrames))
        {
            issues.Add("Ending black frame lies outside project");
        }

        var hasCapture = false;

        foreach (var scene in Scenes)
        {
            if (scene.Frames <= 0 || scene.Frames > 1_000_000 || scene.MediaInFrame < 0)
            {
                issues.Add($"{scene.Name}: invalid duration or media in-point");
            }

            if (scene.Media is { } mediaPath && !SafeRelativePath(mediaPath))
            {
                issues.Add($"{scene.Name}: asset path must stay inside project");
            }

            if (scene.Capture is { } capture)
            {
                if (!double.IsFinite(capture.DurationSeconds) ||
                    capture.DurationSeconds < 1 || capture.DurationSeconds > 60)
                {
                    issues.Add($"{scene.Name}: recording duration must be 1–60 seconds");
                }

                if (capture.GateFrame is long gate &&
                    (capture.Trigger != CaptureTrigger.Gate || gate < 0 || gate >= scene.Frames))
                {
                    issues.Add($"{scene.Name}: recording gate frame must be inside the scene");
                }

                if (capture.RecordingMode == CaptureMode.Manual && capture.Trigger != CaptureTrigger.Gate)
                {
                    issues.Add($"{scene.Name}: manual recording requires a consent gate");
                }

                if (capture.Trigger == CaptureTrigger.Automatic &&
                    (capture.StartFrame < 0 ||
                     capture.StartFrame >= scene.Frames ||
                     capture.StartFrame + capture.DurationSeconds * rate.Fps > scene.Frames))
                {
                    issues.Add($"{scene.Name}: recording window exceeds scene");
                }
            }

            var ids = scene.Cues.Select(cue => cue.Id).ToList();
            if (ids.Distinct().Count() != ids.Count)
            {
                issues.Add($"{scene.Name}: cue identifiers must be unique");
            }

            var sorted = scene.Cues.OrderBy(cue => cue.StartFrame).ToList();
            for (var i = 0; i < sorted.Count; i++)
            {
                var cue = sorted[i];

                if (cue.RepeatCount is long repeatCount && (repeatCount < 1 || repeatCount > 100))
                {
                    issues.Add($"{scene.Name}: repeat count must be 1–100");
                }

                if (cue.RepeatsSource && rate.Seconds(cue.LengthFrames) > CaptureCue.ManualLimitSeconds)
                {
                    issues.Add($"{scene.Name}: repeated voice regions must be at most 10 minutes");
                }

                if (cue.StartFrame < 0 || cue.LengthFrames <= 0 ||
                    cue.StartFrame + cue.LengthFrames > scene.Frames ||
                    cue.SourceInFrame < 0 || cue.FadeInFrames < 0 || cue.FadeOutFrames < 0)
                {
                    issues.Add($"{scene.Name}: voice cue exceeds scene or has invalid trim/fade");
                }

                var captureReady = false;
                if (scene.Capture is { } sceneCapture)
                {
                    if (sceneCapture.Trigger == CaptureTrigger.Gate &&
                        sceneCapture.GateFrame is long sceneGate &&
                        cue.StartFrame > sceneGate)
                    {
                        captureReady = true;
                    }

                    if (sceneCapture.Trigger == CaptureTrigger.Automatic &&
                        cue.StartFrame >=
                        sceneCapture.StartFrame + sceneCapture.DurationSeconds * rate.Fps + rate.Fps * 0.1)
                    {
                        captureReady = true;
                    }
                }

                if (!hasCapture && !captureReady)
                {
                    issues.Add($"{scene.Name}: voice needs a completed recording before playback");
                }

                if (i > 0 && sorted[i - 1].StartFrame + sorted[i - 1].LengthFrames > cue.StartFrame)
                {
                    issues.Add($"{scene.Name}: visitor voice cues cannot overlap");
                }

                foreach (var parameter in EffectParameterInfo.All)
                {
                    var value = cue.Effects[parameter];
                    var (min, max) = EffectSettings.Range(parameter);
                    if (!double.IsFinite(value) || value < min || value > max)
                    {
                        issues.Add($"{scene.Name}: invalid {EffectParameterInfo.JsonName(parameter)}");
                    }
                }

                foreach (var (key, points) in cue.Automation)
                {
                    if (!EffectParameterInfo.TryParse(key, out var parameter))
                    {
                        issues.Add($"Unknown automation parameter {key}");
                        continue;
                    }

                    var (min, max) = EffectSettings.Range(parameter);
                    if (points.Select(point => point.Frame).Distinct().Count() != points.Count ||
                        points.Any(point =>
                            point.Frame < 0 ||
                            point.Frame > cue.LengthFrames ||
                            !double.IsFinite(point.Value) ||
                            point.Value < min ||
                            point.Value > max))
                    {
                        issues.Add($"{scene.Name}: invalid automation points");
                    }
                }
            }

            if (scene.Capture is not null)
            {
                hasCapture = true;
            }
        }

        return issues;
    }

    public static bool SafeRelativePath(string path) =>
        !string.IsNullOrEmpty(path) &&
        !path.StartsWith("/", StringComparison.Ordinal) &&
        !path.Contains(':') &&
        !path.Contains('\\') &&
        !path.Split('/').Contains("..", StringComparer.Ordinal);

    /// <summary>
    /// Resolves a project-relative media path, refusing anything that leaves the
    /// project root through <c>..</c>, an absolute path, a drive/colon path or a
    /// symbolic link/junction.
    /// </summary>
    public string? AssetPath(string path, string root)
    {
        if (!SafeRelativePath(path))
        {
            return null;
        }

        try
        {
            var basePath = ResolveRealPath(Path.GetFullPath(root));
            var relative = path.Replace('/', Path.DirectorySeparatorChar);
            var candidate = Path.GetFullPath(Path.Combine(basePath, relative));
            var resolved = ResolveRealPath(candidate);
            var comparison = OperatingSystem.IsWindows() || OperatingSystem.IsMacOS()
                ? StringComparison.OrdinalIgnoreCase
                : StringComparison.Ordinal;
            var prefix = basePath.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            return resolved.StartsWith(prefix, comparison) ? resolved : null;
        }
        catch (Exception exception) when (
            exception is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            return null;
        }
    }

    private static string ResolveRealPath(string path)
    {
        var fullPath = Path.GetFullPath(path);
        var root = Path.GetPathRoot(fullPath) ?? string.Empty;
        var rest = fullPath[root.Length..];
        var current = root;

        foreach (var component in rest.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
        {
            if (component.Length == 0)
            {
                continue;
            }

            current = Path.Combine(current, component);
            FileSystemInfo? info = null;
            if (Directory.Exists(current))
            {
                info = new DirectoryInfo(current);
            }
            else if (File.Exists(current))
            {
                info = new FileInfo(current);
            }

            if (info is null)
            {
                continue;
            }

            var target = info.ResolveLinkTarget(returnFinalTarget: true);
            if (target is not null)
            {
                current = Path.GetFullPath(target.FullName);
            }
        }

        return current;
    }

    public Project Clone()
    {
        var clone = new Project
        {
            SchemaVersion = SchemaVersion,
            Title = Title,
            Rate = Rate.Clone(),
            FilmLevel = FilmLevel,
            VoiceLevel = VoiceLevel,
            DuckLevel = DuckLevel,
            OutputOffsetMs = OutputOffsetMs,
            BlackFromFrame = BlackFromFrame,
            Scenes = Scenes.Select(scene => scene.Clone()).ToList()
        };

        foreach (var (key, value) in EffectPresets)
        {
            clone.EffectPresets[key] = value.Clone();
        }

        return clone;
    }

    public bool Equals(Project? other)
    {
        if (other is null)
        {
            return false;
        }

        if (SchemaVersion != other.SchemaVersion ||
            !string.Equals(Title, other.Title, StringComparison.Ordinal) ||
            !Rate.Equals(other.Rate) ||
            FilmLevel != other.FilmLevel ||
            VoiceLevel != other.VoiceLevel ||
            DuckLevel != other.DuckLevel ||
            OutputOffsetMs != other.OutputOffsetMs ||
            BlackFromFrame != other.BlackFromFrame ||
            !Scenes.SequenceEqual(other.Scenes) ||
            EffectPresets.Count != other.EffectPresets.Count)
        {
            return false;
        }

        foreach (var (key, value) in EffectPresets)
        {
            if (!other.EffectPresets.TryGetValue(key, out var otherValue) || !value.Equals(otherValue))
            {
                return false;
            }
        }

        return true;
    }

    public override bool Equals(object? obj) => Equals(obj as Project);

    public override int GetHashCode()
    {
        var hash = new HashCode();
        hash.Add(SchemaVersion);
        hash.Add(Title, StringComparer.Ordinal);
        hash.Add(Rate);
        hash.Add(FilmLevel);
        hash.Add(VoiceLevel);
        hash.Add(DuckLevel);
        hash.Add(OutputOffsetMs);
        hash.Add(BlackFromFrame);
        foreach (var scene in Scenes)
        {
            hash.Add(scene);
        }

        foreach (var key in EffectPresets.Keys.OrderBy(key => key, StringComparer.Ordinal))
        {
            hash.Add(key, StringComparer.Ordinal);
            hash.Add(EffectPresets[key]);
        }

        return hash.ToHashCode();
    }
}
