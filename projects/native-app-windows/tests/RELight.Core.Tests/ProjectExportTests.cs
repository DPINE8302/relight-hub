using RELight.Core.Json;

namespace RELight.Core.Tests;

public sealed class ProjectExportTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("relight-export-").FullName;

    public void Dispose()
    {
        try
        {
            Directory.Delete(_root, true);
        }
        catch (IOException)
        {
        }
    }

    [Fact]
    public void ExportsProjectAndReferencedMedia()
    {
        var project = ProjectWithMedia(out var sourceMedia);
        var destination = Path.Combine(_root, "exported");

        ProjectExport.Export(project, _root, destination);

        Assert.True(File.Exists(Path.Combine(destination, "experience.relight")));
        Assert.True(File.Exists(Path.Combine(destination, "media", "Scene01_Draft1_480p_v5.mp4")));
        Assert.Equal(File.ReadAllBytes(sourceMedia), File.ReadAllBytes(
            Path.Combine(destination, "media", "Scene01_Draft1_480p_v5.mp4")));
        Assert.Equal(project, ProjectFileStore.Load(Path.Combine(destination, "experience.relight")));
        Assert.Empty(Directory.EnumerateDirectories(_root, "*.tmp-*", SearchOption.AllDirectories));
    }

    [Fact]
    public void RefusesToOverwriteAnExistingDestination()
    {
        var project = ProjectWithMedia(out _);
        var destination = Path.Combine(_root, "exported");
        Directory.CreateDirectory(destination);
        var sentinel = Path.Combine(destination, "keep.txt");
        File.WriteAllText(sentinel, "keep");

        var error = Assert.Throws<ProjectExportException>(() => ProjectExport.Export(project, _root, destination));
        Assert.Contains("preserve existing files", error.Message);
        Assert.Equal("keep", File.ReadAllText(sentinel));
    }

    [Fact]
    public void MissingMediaLeavesNoPartialExport()
    {
        var project = Project.CreateStarter();
        var destination = Path.Combine(_root, "exported");

        var error = Assert.Throws<ProjectExportException>(() => ProjectExport.Export(project, _root, destination));
        Assert.Contains("Media missing", error.Message);
        Assert.False(Directory.Exists(destination));
        Assert.Empty(Directory.EnumerateDirectories(_root, "*.tmp-*", SearchOption.AllDirectories));
    }

    [Fact]
    public void RejectsWindowsInvalidMediaNamesBeforeCopying()
    {
        var project = ProjectWithMedia(out _);
        project.Scenes[0].Media = "media/CON.mp4";
        var destination = Path.Combine(_root, "exported");

        var error = Assert.Throws<ProjectExportException>(() => ProjectExport.Export(project, _root, destination));
        Assert.Contains("reserved", error.Message);
        Assert.False(Directory.Exists(destination));
    }

    [Fact]
    public void RejectsCaseCollidingMediaNames()
    {
        var project = ProjectWithMedia(out _);
        project.Scenes[1].Media = "media/scene01_draft1_480p_v5.mp4";
        var destination = Path.Combine(_root, "exported");

        var error = Assert.Throws<ProjectExportException>(() => ProjectExport.Export(project, _root, destination));
        Assert.Contains("collide", error.Message);
        Assert.False(Directory.Exists(destination));
    }

    [Fact]
    public void ExportsAProjectWithoutMedia()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = null;
        var destination = Path.Combine(_root, "exported");

        ProjectExport.Export(project, _root, destination);

        Assert.True(Directory.Exists(Path.Combine(destination, "media")));
        Assert.Equal(project, ProjectFileStore.Load(Path.Combine(destination, "experience.relight")));
    }

    private Project ProjectWithMedia(out string sourceMedia)
    {
        var project = Project.CreateStarter();
        var mediaDirectory = Path.Combine(_root, "media");
        Directory.CreateDirectory(mediaDirectory);
        sourceMedia = Path.Combine(mediaDirectory, "Scene01_Draft1_480p_v5.mp4");
        File.WriteAllBytes(sourceMedia, "fixture media"u8.ToArray());
        return project;
    }
}
