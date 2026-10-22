using System.Text;

namespace RELight.Core.Tests;

public sealed class WindowsPathPolicyTests
{
    [Theory]
    [InlineData("media/Scene01_Draft1_480p_v5.mp4")]
    [InlineData("media/ไฟล์ ทดสอบ.mp4")]
    [InlineData("media/space name.mp4")]
    [InlineData("media/.hidden")]
    public void AcceptsPortableRelativePaths(string path)
    {
        Assert.True(WindowsPathPolicy.IsPortableRelativePath(path, out var problem), problem);
    }

    [Theory]
    [InlineData("media/Scene:01.mp4")]
    [InlineData("media/CON.mp4")]
    [InlineData("media/NUL")]
    [InlineData("media/trailing.")]
    [InlineData("media/trailing ")]
    [InlineData("media/invalid?.mp4")]
    [InlineData("media//empty.mp4")]
    [InlineData("media/")]
    [InlineData("../outside.mp4")]
    [InlineData("/absolute.mp4")]
    public void RejectsNamesWindowsCannotStore(string path)
    {
        Assert.False(WindowsPathPolicy.IsPortableRelativePath(path, out var problem));
        Assert.False(string.IsNullOrWhiteSpace(problem));
    }

    [Fact]
    public void RejectsDecomposedUnicodeSoWindowsCanFindTheFile()
    {
        var decomposed = "media/cafe\u0301.mp4";
        Assert.False(WindowsPathPolicy.IsPortableRelativePath(decomposed, out var problem));
        Assert.Contains("NFC", problem);
    }

    [Fact]
    public void SanitizesWindowsInvalidNames()
    {
        Assert.Equal("_CON.txt", WindowsPathPolicy.SanitizeFileName("CON.txt"));
        Assert.Equal("bad_name_.mp4", WindowsPathPolicy.SanitizeFileName("bad:name?.mp4"));
        Assert.Equal("name", WindowsPathPolicy.SanitizeFileName("  name.  "));
        Assert.Equal("media", WindowsPathPolicy.SanitizeFileName(""));
        Assert.Equal("ไฟล์ ทดสอบ.mp4", WindowsPathPolicy.SanitizeFileName("ไฟล์ ทดสอบ.mp4"));
    }

    [Fact]
    public void FindsCaseCollisionsAndNormalizesUnicode()
    {
        var collisions = WindowsPathPolicy.FindCaseCollisions([
            "media/A.mp4",
            "media/a.mp4",
            "media/B.mp4",
            "media/cafe\u0301.mp4",
            "media/café.mp4"
        ]);

        Assert.Contains("media/A.mp4", collisions);
        Assert.Contains("media/a.mp4", collisions);
        Assert.Contains("media/cafe\u0301.mp4", collisions);
        Assert.Contains("media/café.mp4", collisions);
        Assert.DoesNotContain("media/B.mp4", collisions);
    }

    [Fact]
    public void AuditsMediaPathsForRepair()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = "media/CON.mp4";
        project.Scenes[1].Media = "media/A.mp4";
        project.Scenes[2].Media = "media/a.mp4";

        var audits = WindowsPathPolicy.Audit(project);

        Assert.Equal(3, audits.Count);
        Assert.Contains("reserved", audits.Single(audit => audit.SceneId == project.Scenes[0].Id).Problem);
        Assert.Contains("collides", audits.Single(audit => audit.SceneId == project.Scenes[1].Id).Problem);
        Assert.Contains("collides", audits.Single(audit => audit.SceneId == project.Scenes[2].Id).Problem);
    }

    [Fact]
    public void LeavesPortableStarterPathsAlone()
    {
        var audits = WindowsPathPolicy.Audit(Project.CreateStarter());
        var starter = audits.Single();
        Assert.Null(starter.Problem);
    }
}
