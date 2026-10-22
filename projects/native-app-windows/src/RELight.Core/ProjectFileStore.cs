using RELight.Core.Json;

namespace RELight.Core;

public sealed class ProjectFileException : Exception
{
    public ProjectFileException(string message)
        : base(message)
    {
    }

    public ProjectFileException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

/// <summary>
/// Project file loading and atomic saving with the same 2 MB ceiling and
/// timestamped backup behavior as the Mac app. Participant voice is never part
/// of a project file.
/// </summary>
public static class ProjectFileStore
{
    public const long MaxProjectBytes = 2_000_000;

    public static Project Load(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        var info = new FileInfo(path);
        if (!info.Exists)
        {
            throw new ProjectFileException("Project file not found");
        }

        if (info.Length >= MaxProjectBytes)
        {
            throw new ProjectFileException("Project file is too large");
        }

        var data = File.ReadAllBytes(path);
        if (data.LongLength >= MaxProjectBytes)
        {
            throw new ProjectFileException("Project file is too large");
        }

        Project project;
        try
        {
            project = ProjectJson.Deserialize(data);
        }
        catch (RelightJsonException exception)
        {
            throw new ProjectFileException(exception.Message, exception);
        }

        var errors = project.Validation();
        if (errors.Count > 0)
        {
            throw new ProjectFileException(string.Join("\n", errors));
        }

        return project;
    }

    public static void Save(string path, Project project)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        ArgumentNullException.ThrowIfNull(project);

        var errors = project.Validation();
        if (errors.Count > 0)
        {
            throw new ProjectFileException(string.Join("\n", errors));
        }

        var fullPath = Path.GetFullPath(path);
        var directory = Path.GetDirectoryName(fullPath)
            ?? throw new ProjectFileException("Project path has no directory");
        Directory.CreateDirectory(directory);

        if (File.Exists(fullPath))
        {
            Backup(fullPath);
        }

        var bytes = ProjectJson.Serialize(project);
        var temporary = Path.Combine(
            directory,
            "." + Path.GetFileName(fullPath) + "." + Guid.NewGuid().ToString("N") + ".tmp");

        try
        {
            using (var stream = new FileStream(
                       temporary,
                       FileMode.CreateNew,
                       FileAccess.Write,
                       FileShare.None,
                       bufferSize: 16 * 1024,
                       FileOptions.WriteThrough))
            {
                stream.Write(bytes);
                stream.Flush(flushToDisk: true);
            }

            File.Move(temporary, fullPath, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporary))
            {
                File.Delete(temporary);
            }
        }
    }

    private static void Backup(string path)
    {
        var directory = Path.GetDirectoryName(path)!;
        var name = Path.GetFileNameWithoutExtension(path);
        var extension = Path.GetExtension(path);
        var suffix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var backup = Path.Combine(directory, $"{name}.backup-{suffix}{extension}");

        var counter = 1;
        while (File.Exists(backup))
        {
            backup = Path.Combine(directory, $"{name}.backup-{suffix}-{counter++}{extension}");
        }

        try
        {
            File.Copy(path, backup);
        }
        catch (IOException)
        {
            // A backup is best effort; the atomic save still protects the project.
        }
        catch (UnauthorizedAccessException)
        {
            // Same as above.
        }
    }
}
