namespace RELight.Core;

public sealed class ProjectExportException : Exception
{
    public ProjectExportException(string message)
        : base(message)
    {
    }
}

/// <summary>
/// Exports a portable project folder containing <c>experience.relight</c> and
/// every referenced media file. The destination must be new, media paths must
/// already be Windows-portable, and the whole folder is staged before it is
/// moved into place so a failed export cannot overwrite existing work.
/// </summary>
public static class ProjectExport
{
    public const string ProjectFileName = "experience.relight";

    public static void Export(Project project, string sourceRoot, string destination)
    {
        ArgumentNullException.ThrowIfNull(project);
        ArgumentException.ThrowIfNullOrWhiteSpace(sourceRoot);
        ArgumentException.ThrowIfNullOrWhiteSpace(destination);

        var errors = project.Validation();
        if (errors.Count > 0)
        {
            throw new ProjectExportException("Fix project validation before exporting:\n" + string.Join("\n", errors));
        }

        var fullDestination = Path.GetFullPath(destination);
        if (Directory.Exists(fullDestination) || File.Exists(fullDestination))
        {
            throw new ProjectExportException("Choose a new folder name to preserve existing files");
        }

        var mediaPaths = project.Scenes
            .Where(scene => scene.Media is not null)
            .Select(scene => scene.Media!)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        foreach (var path in mediaPaths)
        {
            if (!WindowsPathPolicy.IsPortableRelativePath(path, out var problem))
            {
                throw new ProjectExportException($"{path}: {problem}");
            }
        }

        var collisions = WindowsPathPolicy.FindCaseCollisions(mediaPaths);
        if (collisions.Count > 0)
        {
            throw new ProjectExportException(
                "Media paths collide on Windows: " + string.Join(", ", collisions));
        }

        var parent = Path.GetDirectoryName(fullDestination)
            ?? throw new ProjectExportException("Export destination has no parent folder");
        Directory.CreateDirectory(parent);

        var staging = fullDestination + ".tmp-" + Guid.NewGuid().ToString("N");
        try
        {
            Directory.CreateDirectory(staging);
            Directory.CreateDirectory(Path.Combine(staging, "media"));

            foreach (var path in mediaPaths)
            {
                var source = project.AssetPath(path, sourceRoot);
                if (source is null || !File.Exists(source))
                {
                    throw new ProjectExportException("Media missing or outside project: " + path);
                }

                var target = project.AssetPath(path, staging);
                if (target is null)
                {
                    throw new ProjectExportException("Unsafe media path: " + path);
                }

                var targetDirectory = Path.GetDirectoryName(target);
                if (targetDirectory is null)
                {
                    throw new ProjectExportException("Unsafe media path: " + path);
                }

                Directory.CreateDirectory(targetDirectory);
                File.Copy(source, target, overwrite: false);
            }

            ProjectFileStore.Save(Path.Combine(staging, ProjectFileName), project);
            Directory.Move(staging, fullDestination);
        }
        catch
        {
            TryDelete(staging);
            throw;
        }
    }

    private static void TryDelete(string directory)
    {
        try
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, recursive: true);
            }
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }
}
