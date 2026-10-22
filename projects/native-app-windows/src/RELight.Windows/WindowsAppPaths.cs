namespace RELight.Windows;

/// <summary>
/// Per-machine paths. Calibration and logs live here, never inside a project.
/// </summary>
public static class WindowsAppPaths
{
    public const string AppFolderName = "RELight Native";

    public static string SupportRoot =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            AppFolderName);

    public static string CalibrationFile => Path.Combine(SupportRoot, "calibration.json");

    public static string LogsFolder => Path.Combine(SupportRoot, "logs");

    public static string DefaultProjectFolder => Path.Combine(SupportRoot, "Starter Project");

    public static string DefaultProjectFile => Path.Combine(DefaultProjectFolder, "experience.relight");

    public static string LastProjectFile => Path.Combine(SupportRoot, "last-project.txt");

    public static string BundledExamplesRoot => Path.Combine(AppContext.BaseDirectory, "Examples");

    public static string BundledDraftRoot => Path.Combine(BundledExamplesRoot, "Draft1");

    public static string EnsureSupportRoot()
    {
        Directory.CreateDirectory(SupportRoot);
        return SupportRoot;
    }

    public static string EnsureDefaultProjectFolder()
    {
        Directory.CreateDirectory(DefaultProjectFolder);
        Directory.CreateDirectory(Path.Combine(DefaultProjectFolder, "media"));
        return DefaultProjectFolder;
    }

    /// <summary>
    /// Returns the last project this machine opened or saved, when it still
    /// exists. The path is machine-local and is never written into a project.
    /// </summary>
    public static string? LoadLastProject()
    {
        try
        {
            if (!File.Exists(LastProjectFile))
            {
                return null;
            }

            var path = File.ReadAllText(LastProjectFile);
            return path.Length > 0 && File.Exists(path) ? path : null;
        }
        catch (Exception)
        {
            return null;
        }
    }

    public static void RememberProject(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        try
        {
            EnsureSupportRoot();
            var full = Path.GetFullPath(path);
            if (string.Equals(LoadLastProject(), full, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            var temporary = LastProjectFile + ".tmp";
            File.WriteAllText(temporary, full);
            File.Move(temporary, LastProjectFile, overwrite: true);
        }
        catch (Exception)
        {
            // Remembering a path is best effort; it must never block a save or open.
        }
    }

    public static string? SeedDraftIfAvailable()
    {
        if (!Directory.Exists(BundledDraftRoot))
        {
            return null;
        }

        EnsureSupportRoot();
        var folder = Core.DraftExample.Prepare(SupportRoot, BundledDraftRoot);
        return Path.Combine(folder, Core.DraftExample.ProjectFileName);
    }
}
