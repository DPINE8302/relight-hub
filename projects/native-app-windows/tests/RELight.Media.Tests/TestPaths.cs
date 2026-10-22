namespace RELight.Media.Tests;

internal static class TestPaths
{
    public static string RepoRoot { get; } = FindRepoRoot();

    public static string DraftMedia => Path.Combine(
        RepoRoot,
        "incoming",
        "from-Downloads",
        "media",
        "Draft 1 scene1-4 .mov");

    public static string DraftProjectRoot => Path.Combine(
        RepoRoot,
        "output",
        "native-2.1.2-zip-check",
        "RELight Native with Videos",
        "Draft 1 Project");

    public static string DraftProjectFile => Path.Combine(DraftProjectRoot, "experience.relight");

    public static string Scene01 => Path.Combine(RepoRoot, "scene01.mp4");

    private static string FindRepoRoot()
    {
        var starts = new[]
        {
            new DirectoryInfo(AppContext.BaseDirectory),
            new DirectoryInfo(Directory.GetCurrentDirectory())
        };

        foreach (var start in starts)
        {
            var directory = start;
            while (directory is not null)
            {
                if (directory.Name == "relight-engine" && directory.Parent is not null)
                {
                    return directory.Parent.FullName;
                }

                directory = directory.Parent;
            }
        }

        return Directory.GetCurrentDirectory();
    }
}
