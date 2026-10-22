namespace RELight.Core.Tests;

public sealed class ModelTests
{
    [Fact]
    public void StarterMatchesTheSwiftExpectations()
    {
        var project = Project.CreateStarter();

        Assert.Empty(project.Validation());
        Assert.Equal(2880L, project.TotalFrames);
        Assert.Equal(120.0, project.Rate.Seconds(project.TotalFrames), 12);
        Assert.Equal(432L, project.Scenes[0].Frames);
        Assert.Equal(CaptureTrigger.Gate, project.Scenes[0].Capture!.Trigger);
        Assert.Single(project.Scenes.SelectMany(scene => scene.Cues));
        Assert.Equal(2352L, project.GlobalFrame(3, project.Scenes[3].Cues[0].StartFrame));
        Assert.Equal(2808L, project.BlackFromFrame);
        Assert.Equal("media/Scene01_Draft1_480p_v5.mp4", project.Scenes[0].Media);
        Assert.Equal("Narrowing World / Hospital", project.Scenes[3].Name);
    }

    [Fact]
    public void CueLedgerFiresOnceAndSkipsOnSeek()
    {
        var first = new VoiceCue(10);
        var second = new VoiceCue(20);
        var ledger = new CueLedger();

        Assert.Empty(ledger.Due(9, [first, second]));
        Assert.Equal([first.Id], ledger.Due(10, [first, second]).Select(cue => cue.Id));
        Assert.Empty(ledger.Due(15, [first, second]));

        ledger.Skip(21, [first, second]);
        Assert.Empty(ledger.Due(30, [first, second]));

        ledger.Reset();
        Assert.Equal([first.Id, second.Id], ledger.Due(30, [second, first]).Select(cue => cue.Id));
    }

    [Fact]
    public void AutomationInterpolatesAndHolds()
    {
        var cue = new VoiceCue(0, 100);
        cue.Automation["level"] =
        [
            new AutomationPoint(0, 1),
            new AutomationPoint(100, 0)
        ];

        Assert.Equal(1.0, cue.Value(EffectParameter.Level, 0), 12);
        Assert.Equal(1.0, cue.Value(EffectParameter.Level, -10), 12);
        Assert.Equal(0.5, cue.Value(EffectParameter.Level, 50), 12);
        Assert.Equal(0.0, cue.Value(EffectParameter.Level, 100), 12);
        Assert.Equal(0.0, cue.Value(EffectParameter.Level, 150), 12);
        Assert.Equal(0.0, cue.Value(EffectParameter.Feedback, 50), 12);
    }

    [Fact]
    public void EffectPresetsMatchTheSwiftValues()
    {
        var echo = EffectSettings.Preset("Echo");
        Assert.Equal(280, echo.DelayMs, 12);
        Assert.Equal(0.22, echo.Feedback, 12);
        Assert.Equal(0.18, echo.ReverbWet, 12);
        Assert.Equal(5200, echo.LowPassHz, 12);
        Assert.Null(echo.DelayWet);
        Assert.Equal(0.3, echo[EffectParameter.DelayWet], 12);

        var decay = EffectSettings.Preset("Decay");
        Assert.Equal(320, decay.DelayMs, 12);
        Assert.Equal(0.30, decay.Feedback, 12);
        Assert.Equal(0.35, decay.ReverbWet, 12);
        Assert.Equal(2400, decay.LowPassHz, 12);

        var distorted = EffectSettings.Preset("Distorted");
        Assert.Equal(210, distorted.DelayMs, 12);
        Assert.Equal(0.16, distorted.Feedback, 12);
        Assert.Equal(0.25, distorted.Distortion, 12);
        Assert.Equal(2400, distorted.LowPassHz, 12);

        var unknown = EffectSettings.Preset("Unknown");
        Assert.Equal(0.8, unknown.Level, 12);
        Assert.Equal(18000, unknown.LowPassHz, 12);
        Assert.Equal(0, unknown.DelayMs, 12);
    }

    [Fact]
    public void CloneIsDeepAndEqualUntilMutated()
    {
        var original = Project.CreateStarter();
        var clone = original.Clone();

        Assert.Equal(original, clone);
        Assert.NotSame(original, clone);
        Assert.NotSame(original.Scenes[3].Cues[0], clone.Scenes[3].Cues[0]);

        clone.Scenes[3].Cues[0].Name = "Changed";
        clone.Scenes[3].Cues[0].Effects.Level = 0.1;
        clone.Scenes[3].Cues[0].Automation["level"] = [new AutomationPoint(0, 0.1)];

        Assert.NotEqual(original, clone);
        Assert.Equal("Visitor voice", original.Scenes[3].Cues[0].Name);
        Assert.Equal(0.8, original.Scenes[3].Cues[0].Effects.Level, 12);
        Assert.Empty(original.Scenes[3].Cues[0].Automation);
    }

    [Fact]
    public void AssetPathContainsMediaAndRejectsEscapes()
    {
        var root = Directory.CreateTempSubdirectory("relight-assets-").FullName;
        var outside = Directory.CreateTempSubdirectory("relight-outside-").FullName;
        try
        {
            var media = Path.Combine(root, "media");
            Directory.CreateDirectory(media);
            var mediaFile = Path.Combine(media, "ภาพ ทดสอบ.mp4");
            File.WriteAllText(mediaFile, "fixture");

            var project = new Project();
            var resolved = project.AssetPath("media/ภาพ ทดสอบ.mp4", root);
            Assert.NotNull(resolved);
            Assert.True(File.Exists(resolved));

            Assert.Null(project.AssetPath("../private.wav", root));
            Assert.Null(project.AssetPath("/etc/passwd", root));
            Assert.Null(project.AssetPath("https://example.com/a.mp4", root));
            Assert.Null(project.AssetPath("media/../media/ภาพ ทดสอบ.mp4", root));

            File.WriteAllText(Path.Combine(outside, "passwd"), "outside");
            try
            {
                var escape = Path.Combine(root, "escape");
                Directory.CreateSymbolicLink(escape, outside);
                Assert.Null(project.AssetPath("escape/passwd", root));
                Directory.Delete(escape);
            }
            catch (Exception exception) when (
                exception is IOException or UnauthorizedAccessException or PlatformNotSupportedException)
            {
                // Symlink creation may require developer mode or privileges on Windows.
            }
        }
        finally
        {
            Directory.Delete(root, true);
            Directory.Delete(outside, true);
        }
    }

    [Fact]
    public void ManualAndRepeatSemanticsMatchSwift()
    {
        var capture = new CaptureCue { Mode = CaptureMode.Manual };
        Assert.Equal(CaptureMode.Manual, capture.RecordingMode);
        Assert.Equal(600.0, CaptureCue.ManualLimitSeconds, 12);

        var timed = new CaptureCue();
        Assert.Equal(CaptureMode.Timed, timed.RecordingMode);
        Assert.False(new VoiceCue().RepeatsSource);

        var loop = new VoiceCue { LoopToFill = true };
        Assert.True(loop.RepeatsSource);

        var repeats = new VoiceCue { RepeatCount = 2 };
        Assert.True(repeats.RepeatsSource);
    }

    [Fact]
    public void TimecodeAndFrameConversionMatchSwift()
    {
        var rate = new FrameRate();
        Assert.Equal("00:00:23:18", rate.Timecode(570));
        Assert.Equal(2352L, rate.Frame(rate.Seconds(2352)));

        var ntsc = new FrameRate(24000, 1001);
        Assert.Equal(1000.9999999999999, ntsc.Seconds(24000), 12);

        var cue = new VoiceCue(48, 144);
        Assert.Equal(0L, cue.PlaybackFrame(2, rate, 0));
        Assert.Equal(144L, cue.PlaybackFrame(8, rate, 0));
    }
}
