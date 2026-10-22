using RELight.Core.Json;

namespace RELight.Core.Tests;

public sealed class ProjectFileStoreTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("relight-store-").FullName;

    public void Dispose()
    {
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (IOException)
        {
        }
    }

    [Fact]
    public void SaveThenLoadRoundTripsAValidProject()
    {
        var project = Project.CreateStarter();
        var path = Path.Combine(_root, "experience.relight");

        ProjectFileStore.Save(path, project);
        var loaded = ProjectFileStore.Load(path);

        Assert.Equal(project, loaded);
        Assert.Empty(Directory.GetFiles(_root, "*.tmp"));
    }

    [Fact]
    public void SecondSaveCreatesATimestampedBackup()
    {
        var path = Path.Combine(_root, "experience.relight");
        var first = Project.CreateStarter();
        ProjectFileStore.Save(path, first);
        var firstBytes = File.ReadAllBytes(path);

        var second = Project.CreateStarter();
        second.Title = "Second save";
        ProjectFileStore.Save(path, second);

        var backups = Directory.GetFiles(_root, "experience.backup-*.relight");
        Assert.Single(backups);
        Assert.Equal(firstBytes, File.ReadAllBytes(backups[0]));
        Assert.Equal("Second save", ProjectFileStore.Load(path).Title);
    }

    [Fact]
    public void LoadRejectsOversizedProjects()
    {
        var path = Path.Combine(_root, "large.relight");
        File.WriteAllBytes(path, new byte[ProjectFileStore.MaxProjectBytes]);

        var error = Assert.Throws<ProjectFileException>(() => ProjectFileStore.Load(path));
        Assert.Contains("too large", error.Message);
    }

    [Fact]
    public void LoadRejectsMalformedJson()
    {
        var path = Path.Combine(_root, "broken.relight");
        File.WriteAllText(path, "{ nope");

        var error = Assert.Throws<ProjectFileException>(() => ProjectFileStore.Load(path));
        Assert.Contains("Invalid project JSON", error.Message);
    }

    [Fact]
    public void LoadRejectsProjectsThatFailValidation()
    {
        var path = Path.Combine(_root, "invalid.relight");
        var project = Project.CreateStarter();
        project.Scenes[0].Frames = 0;
        File.WriteAllBytes(path, ProjectJson.Serialize(project));

        var error = Assert.Throws<ProjectFileException>(() => ProjectFileStore.Load(path));
        Assert.Contains("supported limits", error.Message);
    }

    [Fact]
    public void InvalidSaveLeavesTheExistingProjectUntouched()
    {
        var path = Path.Combine(_root, "experience.relight");
        ProjectFileStore.Save(path, Project.CreateStarter());
        var original = File.ReadAllBytes(path);

        var invalid = Project.CreateStarter();
        invalid.Scenes[0].Frames = 0;

        Assert.Throws<ProjectFileException>(() => ProjectFileStore.Save(path, invalid));
        Assert.Equal(original, File.ReadAllBytes(path));
        Assert.Empty(Directory.GetFiles(_root, "*.backup-*"));
    }

    [Fact]
    public void SaveCreatesMissingDirectories()
    {
        var path = Path.Combine(_root, "nested", "folder", "experience.relight");
        ProjectFileStore.Save(path, Project.CreateStarter());

        Assert.True(File.Exists(path));
    }
}
