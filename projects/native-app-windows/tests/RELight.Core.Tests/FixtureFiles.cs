using System.Text;

namespace RELight.Core.Tests;

internal static class FixtureFiles
{
    public static string Root { get; } = Path.Combine(AppContext.BaseDirectory, "fixtures");

    public static string Documents => Path.Combine(Root, "documents");

    public static string InvalidDocuments => Path.Combine(Documents, "invalid");

    public static string Validation => Path.Combine(Root, "validation.json");

    public static string Checks => Path.Combine(Root, "checks.json");

    public static string Legacy => Path.Combine(Root, "legacy");

    public static string Read(string path) => File.ReadAllText(path, Encoding.UTF8);
}
