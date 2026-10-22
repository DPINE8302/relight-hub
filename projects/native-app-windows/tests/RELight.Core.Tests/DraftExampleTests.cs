namespace RELight.Core.Tests;

public sealed class DraftExampleTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("relight-draft-").FullName;

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
    public void SeedsTheDraftFolderOnce()
    {
        var bundled = CreateBundledExample();
        var support = Path.Combine(_root, "support");

        var destination = DraftExample.Prepare(support, bundled);

        Assert.Equal(Path.Combine(support, "Draft 1 Rehearsal"), destination);
        Assert.Equal("project", File.ReadAllText(Path.Combine(destination, "experience.relight")));
        Assert.Equal("movie", File.ReadAllText(Path.Combine(destination, "media", "Draft 1 scene1-4 .mov")));
    }

    [Fact]
    public void RestoresMissingBundledFilesWithoutReplacingEdits()
    {
        var bundled = CreateBundledExample();
        var support = Path.Combine(_root, "support");
        var destination = DraftExample.Prepare(support, bundled);

        File.WriteAllText(Path.Combine(destination, "experience.relight"), "edited");
        File.Delete(Path.Combine(destination, "media", "Draft 1 scene1-4 .mov"));

        var restored = DraftExample.Prepare(support, bundled);
        Assert.Equal(destination, restored);
        Assert.Equal("edited", File.ReadAllText(Path.Combine(destination, "experience.relight")));
        Assert.Equal("movie", File.ReadAllText(Path.Combine(destination, "media", "Draft 1 scene1-4 .mov")));
    }

    [Fact]
    public void PreservesAdditionalRecipientFiles()
    {
        var bundled = CreateBundledExample();
        var support = Path.Combine(_root, "support");
        var destination = DraftExample.Prepare(support, bundled);
        var notes = Path.Combine(destination, "notes.txt");
        File.WriteAllText(notes, "mine");

        DraftExample.Prepare(support, bundled);

        Assert.Equal("mine", File.ReadAllText(notes));
    }

    [Fact]
    public void FailsWhenTheBundledExampleIsMissing()
    {
        var error = Assert.Throws<ProjectFileException>(() =>
            DraftExample.Prepare(Path.Combine(_root, "support"), Path.Combine(_root, "nope")));
        Assert.Contains("not included", error.Message);
    }

    private string CreateBundledExample()
    {
        var bundled = Path.Combine(_root, "bundled");
        Directory.CreateDirectory(Path.Combine(bundled, "media"));
        File.WriteAllText(Path.Combine(bundled, "experience.relight"), "project");
        File.WriteAllText(Path.Combine(bundled, "media", "Draft 1 scene1-4 .mov"), "movie");
        return bundled;
    }
}
