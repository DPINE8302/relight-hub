using System.Globalization;
using RELight.Core;

namespace RELight.Media;

public readonly record struct MediaCheck(bool Valid, string Detail);

/// <summary>
/// The Windows counterpart of the Mac app's <c>validateMedia</c>: each scene's
/// media must resolve inside the project, contain a video track, cover
/// <c>mediaInFrame + frames</c> with the same 1.1-frame tolerance, and run at
/// the project rate within 0.05 fps.
/// </summary>
public static class MediaValidator
{
    public static IReadOnlyDictionary<Guid, MediaCheck> Validate(Project project, string root)
    {
        ArgumentNullException.ThrowIfNull(project);
        ArgumentException.ThrowIfNullOrWhiteSpace(root);

        var checks = new Dictionary<Guid, MediaCheck>();
        foreach (var scene in project.Scenes)
        {
            if (scene.Media is null)
            {
                checks[scene.Id] = new MediaCheck(false, "Film not supplied · rehearsal text available");
                continue;
            }

            var path = project.AssetPath(scene.Media, root);
            if (path is null || !File.Exists(path))
            {
                checks[scene.Id] = new MediaCheck(false, "Media missing or outside project");
                continue;
            }

            MediaInfo info;
            try
            {
                info = IsoBmffProbe.Probe(path);
            }
            catch (Exception exception) when (
                exception is IOException or InvalidDataException or UnauthorizedAccessException
                    or NotSupportedException or ArgumentException)
            {
                checks[scene.Id] = new MediaCheck(false, "Not a playable video");
                continue;
            }

            var video = info.Video;
            if (video is null || video.Width <= 0 || video.Height <= 0 ||
                video.FrameRate <= 0 || info.DurationSeconds <= 0)
            {
                checks[scene.Id] = new MediaCheck(false, "Not a playable video");
                continue;
            }

            var lengthMatch = info.DurationSeconds * project.Rate.Fps + 1.1 >= scene.MediaInFrame + scene.Frames;
            var rateMatch = Math.Abs(video.FrameRate - project.Rate.Fps) < 0.05;
            var valid = lengthMatch && rateMatch;

            var detail = valid
                ? $"{scene.Frames} frames from source {scene.MediaInFrame} · {FormatRate(video.FrameRate)} fps · playable"
                : $"Needs source frames {scene.MediaInFrame}–{scene.MediaInFrame + scene.Frames} at {FormatRate(project.Rate.Fps)} fps; found {(long)Math.Round(info.DurationSeconds * video.FrameRate, MidpointRounding.AwayFromZero)} frames at {FormatRate(video.FrameRate)} fps";

            checks[scene.Id] = new MediaCheck(valid, detail);
        }

        return checks;
    }

    private static string FormatRate(double value) =>
        value.ToString("0.0###", CultureInfo.InvariantCulture);
}
