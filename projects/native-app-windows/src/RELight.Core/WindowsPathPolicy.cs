using System.Text;

namespace RELight.Core;

public sealed record MediaPathAudit(Guid SceneId, string SceneName, string Path, string? Problem);

/// <summary>
/// Windows-specific path rules. Mac paths are allowed to contain names that
/// Windows cannot store; these helpers surface them as repairable problems
/// instead of letting a project fail halfway through an exhibition.
/// </summary>
public static class WindowsPathPolicy
{
    public const int MaxSegmentLength = 255;
    public const int MaxRelativePathLength = 30_000;

    private static readonly char[] InvalidChars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

    private static readonly HashSet<string> ReservedNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "CON", "PRN", "AUX", "NUL", "CLOCK$", "CONIN$", "CONOUT$",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
    };

    public static bool IsPortableRelativePath(string path, out string? problem)
    {
        problem = null;
        if (!Project.SafeRelativePath(path))
        {
            problem = "path is empty, absolute, or escapes the project";
            return false;
        }

        if (path.Length > MaxRelativePathLength)
        {
            problem = "path is too long for Windows";
            return false;
        }

        var segments = path.Split('/');
        foreach (var segment in segments)
        {
            if (!IsValidSegment(segment, out var segmentProblem))
            {
                problem = segmentProblem;
                return false;
            }
        }

        if (Normalize(path) != path)
        {
            problem = "path uses decomposed Unicode; rename it to NFC";
            return false;
        }

        return true;
    }

    public static bool IsValidSegment(string segment, out string? problem)
    {
        problem = null;
        if (string.IsNullOrEmpty(segment))
        {
            problem = "empty path segment";
            return false;
        }

        if (segment is "." or "..")
        {
            problem = "relative path segment";
            return false;
        }

        if (segment.Length > MaxSegmentLength)
        {
            problem = "file name is longer than 255 characters";
            return false;
        }

        if (segment[^1] is '.' or ' ')
        {
            problem = "file name ends with a dot or space";
            return false;
        }

        foreach (var character in segment)
        {
            if (character < 0x20 || InvalidChars.Contains(character))
            {
                problem = "file name contains a character Windows cannot store";
                return false;
            }
        }

        if (IsReservedName(segment))
        {
            problem = "file name is reserved by Windows";
            return false;
        }

        return true;
    }

    public static bool IsReservedName(string name)
    {
        var baseName = name.Split('.')[0];
        return baseName.Length > 0 && ReservedNames.Contains(baseName);
    }

    public static string Normalize(string value) => value.Normalize(NormalizationForm.FormC);

    public static string SanitizeFileName(string name, string fallback = "media")
    {
        var builder = new StringBuilder();
        foreach (var character in Normalize(name))
        {
            builder.Append(character < 0x20 || InvalidChars.Contains(character) ? '_' : character);
        }

        var sanitized = builder.ToString().TrimStart(' ').TrimEnd(' ', '.');
        if (sanitized is "" or "." or "..")
        {
            return fallback;
        }

        if (sanitized.Length > MaxSegmentLength)
        {
            sanitized = sanitized[..MaxSegmentLength].TrimEnd(' ', '.');
        }

        if (IsReservedName(sanitized))
        {
            sanitized = "_" + sanitized;
        }

        return sanitized.Length == 0 ? fallback : sanitized;
    }

    public static IReadOnlyList<string> FindCaseCollisions(IEnumerable<string> paths)
    {
        var collisions = new List<string>();
        foreach (var group in paths
                     .GroupBy(path => Normalize(path).ToUpperInvariant(), StringComparer.Ordinal)
                     .Where(group => group.Select(path => path).Distinct(StringComparer.Ordinal).Count() > 1))
        {
            collisions.AddRange(group.Distinct(StringComparer.Ordinal));
        }

        return collisions;
    }

    public static IReadOnlyList<MediaPathAudit> Audit(Project project)
    {
        ArgumentNullException.ThrowIfNull(project);
        var audits = new List<MediaPathAudit>();
        var paths = new List<string>();

        foreach (var scene in project.Scenes)
        {
            if (scene.Media is null)
            {
                continue;
            }

            paths.Add(scene.Media);
            IsPortableRelativePath(scene.Media, out var problem);
            audits.Add(new MediaPathAudit(scene.Id, scene.Name, scene.Media, problem));
        }

        var collisions = FindCaseCollisions(paths);
        if (collisions.Count == 0)
        {
            return audits;
        }

        var collisionSet = collisions.ToHashSet(StringComparer.Ordinal);
        return audits
            .Select(audit => collisionSet.Contains(audit.Path) && audit.Problem is null
                ? audit with { Problem = "path collides with another media file on Windows" }
                : audit)
            .ToList();
    }
}
