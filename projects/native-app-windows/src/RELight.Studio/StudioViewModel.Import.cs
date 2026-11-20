using System.Text;
using RELight.Core;
using RELight.Media;

namespace RELight.Studio;

public sealed partial class StudioViewModel
{
    public async Task ImportAssetAsync(string source, bool narrator = false, bool fitScene = false,
        CancellationToken cancellationToken = default)
    {
        if (Locked)
        {
            throw new InvalidOperationException("Stop playback before importing media.");
        }

        var original = Project;
        var candidate = original.Clone();
        var index = SelectedScene;
        var scene = candidate.Scenes[index];
        var root = RootDirectory;
        source = Path.GetFullPath(source);
        var relative = Path.GetRelativePath(root, source).Replace('\\', '/');
        var alreadyInside = WindowsPathPolicy.IsPortableRelativePath(relative, out _) &&
            candidate.AssetPath(relative, root) is { } existing && File.Exists(existing);
        string? partial = null;
        string? destination = null;

        try
        {
            var checkPath = source;
            if (!alreadyInside)
            {
                var fileName = Path.GetFileName(source).Normalize(NormalizationForm.FormC);
                var stem = Path.GetFileNameWithoutExtension(fileName);
                var extension = Path.GetExtension(fileName);
                relative = "media/" + fileName;
                for (var suffix = 2; ; suffix++)
                {
                    if (!WindowsPathPolicy.IsPortableRelativePath(relative, out var problem))
                    {
                        throw new IOException($"Rename the media file before importing: {problem}.");
                    }

                    destination = candidate.AssetPath(relative, root)
                        ?? throw new IOException("The media folder points outside this project.");
                    if (!File.Exists(destination) && !Directory.Exists(destination))
                    {
                        break;
                    }

                    relative = $"media/{stem} ({suffix}){extension}";
                }

                Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
                partial = candidate.AssetPath($"media/.import-{Guid.NewGuid():N}{extension}", root)
                    ?? throw new IOException("The media folder points outside this project.");
                await using (var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read, 1024 * 1024, true))
                await using (var output = new FileStream(partial, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1024 * 1024, true))
                {
                    await input.CopyToAsync(output, cancellationToken);
                }
                checkPath = partial;
            }

            if (narrator)
            {
                if (scene.Capture is not { } capture)
                {
                    throw new InvalidOperationException("Enable visitor recording in Scene settings before importing narrator audio.");
                }

                _audio.ValidateNarrator(checkPath);
                capture.Narrator = relative;
            }
            else
            {
                var media = await Task.Run(() => IsoBmffProbe.Probe(checkPath), cancellationToken);
                var clipFrames = media.DurationSeconds * candidate.Rate.Fps;
                if (media.Video is not { Width: > 0, Height: > 0 } video ||
                    Math.Abs(video.FrameRate - candidate.Rate.Fps) >= 0.05 ||
                    !double.IsFinite(clipFrames) || clipFrames < 1 ||
                    (fitScene ? clipFrames > 1_000_000 : clipFrames + 1.1 < scene.Frames))
                {
                    throw new InvalidDataException(
                        $"Choose a playable film at {candidate.Rate.Fps:0.###} fps that covers the scene.");
                }

                scene.Media = relative;
                scene.MediaInFrame = 0;
                scene.Draft = true;
                if (fitScene)
                {
                    scene.Frames = candidate.Rate.Frame(media.DurationSeconds);
                    if (candidate.BlackFromFrame is long black)
                    {
                        candidate.BlackFromFrame = Math.Max(0, candidate.TotalFrames - (original.TotalFrames - black));
                    }
                }
            }

            var issues = candidate.Validation().Except(original.Validation()).ToArray();
            if (issues.Length > 0)
            {
                throw new InvalidDataException(string.Join(Environment.NewLine, issues));
            }

            cancellationToken.ThrowIfCancellationRequested();
            if (Locked || !ReferenceEquals(original, Project) || root != RootDirectory || index != SelectedScene)
            {
                throw new InvalidOperationException("The scene or project changed during import. Choose the file again.");
            }

            if (partial is not null)
            {
                File.Move(partial, destination!);
                partial = null;
            }

            Mutate(project =>
            {
                project.Scenes[index] = scene;
                project.BlackFromFrame = candidate.BlackFromFrame;
            });
            Report(narrator ? "Narrator imported." : "Film imported. Review and approve the new export.");
            await ValidateMediaAsync();
        }
        finally
        {
            if (partial is not null)
            {
                File.Delete(partial);
            }
        }
    }
}
