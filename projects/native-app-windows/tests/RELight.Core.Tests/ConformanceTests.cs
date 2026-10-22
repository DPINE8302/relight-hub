using System.Text.Json;
using RELight.Core.Json;

namespace RELight.Core.Tests;

public sealed class ConformanceTests
{
    [Fact]
    public void EveryFixtureDocumentRoundTripsByteForByte()
    {
        var files = Directory.GetFiles(FixtureFiles.Documents, "*.relight", SearchOption.AllDirectories);
        Assert.NotEmpty(files);

        foreach (var file in files)
        {
            var original = FixtureFiles.Read(file);
            var project = ProjectJson.Deserialize(original);
            var serialized = ProjectJson.SerializeToString(project);
            Assert.True(
                original == serialized,
                $"{Path.GetFileName(file)} did not round-trip.\n--- expected ---\n{original}\n--- actual ---\n{serialized}");
        }
    }

    [Fact]
    public void InvalidFixtureDocumentsMatchTheSwiftValidationMessages()
    {
        using var validation = JsonDocument.Parse(FixtureFiles.Read(FixtureFiles.Validation));
        var files = Directory.GetFiles(FixtureFiles.InvalidDocuments, "*.relight");
        Assert.NotEmpty(files);

        foreach (var file in files)
        {
            var name = Path.GetFileNameWithoutExtension(file);
            Assert.True(validation.RootElement.TryGetProperty(name, out var expectedElement), $"No validation entry for {name}.");

            var expected = expectedElement
                .EnumerateArray()
                .Select(item => item.GetString() ?? "")
                .OrderBy(item => item, StringComparer.Ordinal)
                .ToArray();

            var project = ProjectJson.Deserialize(FixtureFiles.Read(file));
            var actual = project.Validation()
                .OrderBy(item => item, StringComparer.Ordinal)
                .ToArray();

            Assert.Equal(expected, actual);
        }
    }

    [Fact]
    public void InfiniteFeedbackIsValidationOnlyButStillRejected()
    {
        var project = Project.CreateStarter();
        project.Scenes[3].Cues[0].Effects.Feedback = double.PositiveInfinity;
        Assert.Contains(
            "Narrowing World / Hospital: invalid feedback",
            project.Validation());
    }

    [Fact]
    public void SwiftComputedChecksMatch()
    {
        using var checks = JsonDocument.Parse(FixtureFiles.Read(FixtureFiles.Checks));
        var root = checks.RootElement;

        Assert.Equal(2413, root.GetProperty("draft1.totalFrames").GetInt64());
        Assert.Equal(1914, root.GetProperty("draft1.globalFrame.3.384").GetInt64());
        Assert.Equal(2341, root.GetProperty("draft1.blackFromFrame").GetInt64());
        Assert.Equal(24.0, root.GetProperty("draft1.rate.fps").GetDouble(), 12);

        Assert.Equal(2880, root.GetProperty("starter.totalFrames").GetInt64());
        Assert.Equal(120.0, root.GetProperty("starter.seconds").GetDouble(), 12);
        Assert.Equal(2352, root.GetProperty("starter.cue.globalFrame").GetInt64());

        var rate = new FrameRate();
        Assert.Equal("00:00:23:18", root.GetProperty("timecode.570").GetString());
        Assert.Equal("00:00:23:18", rate.Timecode(570));
        Assert.Equal(2352, rate.Frame(rate.Seconds(2352)));

        var ntsc = new FrameRate(24000, 1001);
        Assert.Equal(1000.9999999999999, ntsc.Seconds(24000), 12);
        Assert.Equal(23.976023976023978, ntsc.Fps, 12);

        var cue = new VoiceCue(48, 144);
        Assert.Equal(0, cue.PlaybackFrame(2, rate, 0));
        Assert.Equal(0, cue.PlaybackFrame(1.5, rate, 500));
        Assert.Equal(0, cue.PlaybackFrame(2.5, rate, -500));
        Assert.Equal(144, cue.PlaybackFrame(7.5, rate, 500));
        Assert.Equal(144, cue.PlaybackFrame(8.5, rate, -500));
        Assert.Equal(0, cue.PlaybackFrame(1, rate, 500, 2));

        Assert.Equal(0, cue.Envelope(-1), 12);
        Assert.Equal(0, cue.Envelope(0), 12);
        Assert.Equal(0.5, cue.Envelope(1), 12);
        Assert.Equal(1, cue.Envelope(2), 12);
        Assert.Equal(1, cue.Envelope(138), 12);
        Assert.Equal(1.0 / 3.0, cue.Envelope(142), 12);
        Assert.Equal(0, cue.Envelope(144), 12);

        Assert.True(root.GetProperty("safe.media").GetBoolean());
        Assert.True(root.GetProperty("safe.thaiSpace").GetBoolean());
        Assert.True(root.GetProperty("safe.currentDir").GetBoolean());
        Assert.False(root.GetProperty("safe.parent").GetBoolean());
        Assert.False(root.GetProperty("safe.absolute").GetBoolean());
        Assert.False(root.GetProperty("safe.colon").GetBoolean());
        Assert.False(root.GetProperty("safe.backslash").GetBoolean());
        Assert.False(root.GetProperty("safe.empty").GetBoolean());

        Assert.True(Project.SafeRelativePath("media/a.mp4"));
        Assert.True(Project.SafeRelativePath("media/ภาพ ทดสอบ.mp4"));
        Assert.True(Project.SafeRelativePath("./media/a.mp4"));
        Assert.False(Project.SafeRelativePath("../private.wav"));
        Assert.False(Project.SafeRelativePath("/etc/passwd"));
        Assert.False(Project.SafeRelativePath("media/a:b.mp4"));
        Assert.False(Project.SafeRelativePath("media/a\\b.mp4"));
        Assert.False(Project.SafeRelativePath(""));

        Assert.Equal(0.55, root.GetProperty("full.scene0.delayWet").GetDouble(), 12);
        Assert.Equal(2, root.GetProperty("full.scene0.repeatCount").GetInt64());
        Assert.Equal("timed", root.GetProperty("legacyCapture.recordingMode").GetString());
        Assert.Equal(600.0, root.GetProperty("legacyCapture.manualLimitSeconds").GetDouble(), 12);
    }

    [Fact]
    public void DraftAndFullFixturesPreserveTheirShape()
    {
        var draft = ProjectJson.Deserialize(FixtureFiles.Read(Path.Combine(FixtureFiles.Documents, "draft1.relight")));
        Assert.Empty(draft.Validation());
        Assert.Equal(5, draft.Scenes.Count);
        Assert.Equal(2413, draft.TotalFrames);
        Assert.Equal(2341, draft.BlackFromFrame);
        Assert.Equal("Draft 1 · Scenes 1–4 · provisional boundaries", draft.Title);
        Assert.Equal("media/Draft 1 scene1-4 .mov", draft.Scenes[0].Media);
        Assert.Equal(384, draft.Scenes[3].Cues[0].StartFrame);
        Assert.Equal(163, draft.Scenes[3].Cues[0].LengthFrames);
        Assert.Null(draft.Scenes[3].Cues[0].Effects.DelayWet);
        Assert.Equal(0.3, draft.Scenes[3].Cues[0].Effects[EffectParameter.DelayWet]);
        Assert.Equal(CaptureMode.Timed, draft.Scenes[0].Capture!.RecordingMode);

        var full = ProjectJson.Deserialize(FixtureFiles.Read(Path.Combine(FixtureFiles.Documents, "full.relight")));
        Assert.Empty(full.Validation());
        Assert.Equal(2, full.Scenes[0].Cues[0].RepeatCount);
        Assert.True(full.Scenes[0].Cues[0].LoopToFill);
        Assert.Equal(0.55, full.Scenes[0].Cues[0].Effects.DelayWet!.Value, 12);
        Assert.Equal(CaptureMode.Manual, full.Scenes[0].Capture!.RecordingMode);
        Assert.Equal(24, full.Scenes[0].Capture!.GateFrame);
        Assert.Equal(0.8, full.Scenes[0].Cues[0].Value(EffectParameter.Level, 0), 12);
        Assert.Equal(0.2, full.Scenes[0].Cues[0].Value(EffectParameter.Level, 192), 12);
        Assert.Equal(0.5, full.Scenes[0].Cues[0].Value(EffectParameter.Level, 96), 12);
        Assert.Equal(2, full.Scenes[0].Cues[0].Automation["pan"].Count);
        Assert.Single(full.EffectPresets);
        Assert.Equal(5200, full.EffectPresets["Custom"].LowPassHz, 12);
        Assert.True(full.Scenes[0].Cues[0].RepeatsSource);
    }

    [Fact]
    public void SerializedOutputHasNoTrailingNewline()
    {
        var text = ProjectJson.SerializeToString(Project.CreateStarter());
        Assert.False(text.EndsWith('\n'));
        Assert.EndsWith("}", text);
    }
}
