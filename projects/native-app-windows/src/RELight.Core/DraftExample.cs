namespace RELight.Core;

/// <summary>
/// First-launch Draft 1 seeding. Copies the bundled example once, and on later
/// launches restores only the bundled files that are missing, so a recipient's
/// edits to <c>experience.relight</c> survive an app update.
/// </summary>
public static class DraftExample
{
    public const string FolderName = "Draft 1 Rehearsal";
    public const string ProjectFileName = "experience.relight";
    public const string MediaRelativePath = "media/Draft 1 scene1-4 .mov";

    public static string Prepare(string supportRoot, string bundledExampleRoot)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(supportRoot);
        ArgumentException.ThrowIfNullOrWhiteSpace(bundledExampleRoot);

        if (!Directory.Exists(bundledExampleRoot))
        {
            throw new ProjectFileException("Draft example is not included in this build");
        }

        var destination = Path.Combine(Path.GetFullPath(supportRoot), FolderName);
        Directory.CreateDirectory(Path.GetFullPath(supportRoot));

        if (!Directory.Exists(destination))
        {
            CopyDirectory(bundledExampleRoot, destination);
            return destination;
        }

        foreach (var relative in new[] { ProjectFileName, MediaRelativePath })
        {
            var target = Path.Combine(destination, relative.Replace('/', Path.DirectorySeparatorChar));
            if (File.Exists(target))
            {
                continue;
            }

            var source = Path.Combine(bundledExampleRoot, relative.Replace('/', Path.DirectorySeparatorChar));
            var targetDirectory = Path.GetDirectoryName(target);
            if (targetDirectory is not null)
            {
                Directory.CreateDirectory(targetDirectory);
            }

            File.Copy(source, target);
        }

        return destination;
    }

    private static void CopyDirectory(string source, string destination)
    {
        Directory.CreateDirectory(destination);
        foreach (var directory in Directory.EnumerateDirectories(source, "*", SearchOption.AllDirectories))
        {
            Directory.CreateDirectory(Path.Combine(destination, Path.GetRelativePath(source, directory)));
        }

        foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
        {
            var target = Path.Combine(destination, Path.GetRelativePath(source, file));
            var targetDirectory = Path.GetDirectoryName(target);
            if (targetDirectory is not null)
            {
                Directory.CreateDirectory(targetDirectory);
            }

            File.Copy(file, target, overwrite: false);
        }
    }
}
