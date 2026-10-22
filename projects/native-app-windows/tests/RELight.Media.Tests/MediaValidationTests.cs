using RELight.Core;
using RELight.Core.Json;

namespace RELight.Media.Tests;

public sealed class MediaValidationTests
{
    [Fact]
    public void DraftProjectMatchesTheMacMediaRules()
    {
        if (!File.Exists(TestPaths.DraftProjectFile) || !File.Exists(TestPaths.DraftMedia))
        {
            return;
        }

        var project = ProjectJson.Deserialize(File.ReadAllText(TestPaths.DraftProjectFile));
        var checks = MediaValidator.Validate(project, TestPaths.DraftProjectRoot);

        Assert.Equal(5, checks.Count);
        for (var index = 0; index < 4; index++)
        {
            var scene = project.Scenes[index];
            Assert.True(checks[scene.Id].Valid, checks[scene.Id].Detail);
        }

        var pending = project.Scenes[4];
        Assert.False(checks[pending.Id].Valid);
        Assert.Contains("Film not supplied", checks[pending.Id].Detail);
    }

    [Fact]
    public void RateMismatchInvalidatesEveryMediaScene()
    {
        if (!File.Exists(TestPaths.DraftProjectFile) || !File.Exists(TestPaths.DraftMedia))
        {
            return;
        }

        var project = ProjectJson.Deserialize(File.ReadAllText(TestPaths.DraftProjectFile));
        project.Rate = new FrameRate(30);

        var checks = MediaValidator.Validate(project, TestPaths.DraftProjectRoot);
        for (var index = 0; index < 4; index++)
        {
            var check = checks[project.Scenes[index].Id];
            Assert.False(check.Valid);
            Assert.Contains("at 30.0 fps", check.Detail);
        }
    }

    [Fact]
    public void CoverageMismatchInvalidatesTheScene()
    {
        if (!File.Exists(TestPaths.DraftProjectFile) || !File.Exists(TestPaths.DraftMedia))
        {
            return;
        }

        var project = ProjectJson.Deserialize(File.ReadAllText(TestPaths.DraftProjectFile));
        project.Scenes[3].Frames += 100;

        var checks = MediaValidator.Validate(project, TestPaths.DraftProjectRoot);
        Assert.False(checks[project.Scenes[3].Id].Valid);
        Assert.Contains("Needs source frames", checks[project.Scenes[3].Id].Detail);
    }

    [Fact]
    public void MissingAndEscapingPathsAreRejectedBeforeProbing()
    {
        if (!File.Exists(TestPaths.DraftProjectFile))
        {
            return;
        }

        var project = ProjectJson.Deserialize(File.ReadAllText(TestPaths.DraftProjectFile));
        project.Scenes[0].Media = "media/not-here.mov";
        project.Scenes[1].Media = "../outside.mov";

        var checks = MediaValidator.Validate(project, TestPaths.DraftProjectRoot);
        Assert.Equal("Media missing or outside project", checks[project.Scenes[0].Id].Detail);
        Assert.Equal("Media missing or outside project", checks[project.Scenes[1].Id].Detail);
    }

    [Fact]
    public void MalformedMediaIsNotPlayable()
    {
        var root = Directory.CreateTempSubdirectory("relight-media-").FullName;
        try
        {
            Directory.CreateDirectory(Path.Combine(root, "media"));
            File.WriteAllBytes(Path.Combine(root, "media", "bad.mov"), "not a movie"u8.ToArray());

            var project = Project.CreateStarter();
            project.Scenes[0].Media = "media/bad.mov";

            var checks = MediaValidator.Validate(project, root);
            Assert.False(checks[project.Scenes[0].Id].Valid);
            Assert.Equal("Not a playable video", checks[project.Scenes[0].Id].Detail);
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }
}
