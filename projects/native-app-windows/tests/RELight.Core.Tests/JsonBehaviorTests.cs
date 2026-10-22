using System.Text.Json.Nodes;
using RELight.Core.Json;

namespace RELight.Core.Tests;

public sealed class JsonBehaviorTests
{
    private const string SceneId = "219B4078-043F-43CE-8A61-F0781C94786C";
    private const string CueId = "A5907A30-8FF6-4B1E-BF58-19F9E211EA09";

    [Fact]
    public void MinimalProjectDecodesWithOptionalFieldsAbsent()
    {
        var project = ProjectJson.Deserialize(MinimalProject().ToJsonString());

        Assert.Null(project.BlackFromFrame);
        Assert.Empty(project.EffectPresets);
        Assert.Single(project.Scenes);
        Assert.Null(project.Scenes[0].Capture);
        Assert.Empty(project.Scenes[0].Cues);
        Assert.Empty(project.Validation());
    }

    [Fact]
    public void MissingRequiredPropertyThrows()
    {
        var node = MinimalProject();
        node.Remove("title");

        Assert.Throws<RelightJsonException>(() => ProjectJson.Deserialize(node.ToJsonString()));
    }

    [Fact]
    public void UnknownKeysAreIgnoredLikeSwift()
    {
        var node = MinimalProject();
        node["unknownTopLevel"] = 42;
        node["scenes"]![0]!.AsObject()["unknownSceneKey"] = new JsonObject { ["nested"] = true };

        var project = ProjectJson.Deserialize(node.ToJsonString());
        Assert.Equal("Minimal", project.Title);
        Assert.Empty(project.Validation());
    }

    [Fact]
    public void NullOptionalFieldsAreAcceptedAndOmittedOnWrite()
    {
        var node = MinimalProject();
        node["blackFromFrame"] = null;

        var project = ProjectJson.Deserialize(node.ToJsonString());
        Assert.Null(project.BlackFromFrame);

        var text = ProjectJson.SerializeToString(project);
        Assert.DoesNotContain("blackFromFrame", text);
        Assert.DoesNotContain("null", text);
    }

    [Fact]
    public void LowercaseUuidIsAcceptedAndReencodedUppercase()
    {
        var node = MinimalProject();
        node["scenes"]![0]!.AsObject()["id"] = SceneId.ToLowerInvariant();

        var project = ProjectJson.Deserialize(node.ToJsonString());
        var text = ProjectJson.SerializeToString(project);

        Assert.Contains($"\"id\" : \"{SceneId}\"", text);
    }

    [Fact]
    public void InvalidEnumLiteralThrows()
    {
        var node = MinimalProject();
        var scene = node["scenes"]![0]!.AsObject();
        scene["capture"] = new JsonObject
        {
            ["trigger"] = "sideways",
            ["startFrame"] = 0,
            ["durationSeconds"] = 6
        };

        Assert.Throws<RelightJsonException>(() => ProjectJson.Deserialize(node.ToJsonString()));
    }

    [Fact]
    public void FractionalFrameCountsThrow()
    {
        var node = MinimalProject();
        node["scenes"]![0]!.AsObject()["frames"] = 1.5;

        Assert.Throws<RelightJsonException>(() => ProjectJson.Deserialize(node.ToJsonString()));
    }

    [Fact]
    public void MissingRequiredEffectValueThrows()
    {
        var node = MinimalProject();
        AddCue(node, includeFeedback: false);

        Assert.Throws<RelightJsonException>(() => ProjectJson.Deserialize(node.ToJsonString()));
    }

    [Fact]
    public void MissingDelayWetKeepsLegacyThirtyPercentMixAndStaysOmitted()
    {
        var node = MinimalProject();
        AddCue(node, includeFeedback: true);

        var project = ProjectJson.Deserialize(node.ToJsonString());
        var cue = project.Scenes[0].Cues.Single();

        Assert.Null(cue.Effects.DelayWet);
        Assert.Equal(0.3, cue.Effects[EffectParameter.DelayWet], 12);

        var text = ProjectJson.SerializeToString(project);
        Assert.DoesNotContain("delayWet", text);
    }

    [Fact]
    public void AuthoredDelayWetIsWritten()
    {
        var project = Project.CreateStarter();
        project.Scenes[3].Cues[0].Effects[EffectParameter.DelayWet] = 0.75;

        var text = ProjectJson.SerializeToString(project);
        Assert.Contains("\"delayWet\" : 0.75", text);
    }

    [Fact]
    public void NonFiniteNumbersAreRejectedByTheWriter()
    {
        var project = Project.CreateStarter();
        project.Scenes[3].Cues[0].Effects.Feedback = double.NaN;

        Assert.Throws<RelightJsonException>(() => ProjectJson.SerializeToString(project));
    }

    [Fact]
    public void SlashesAndThaiTextAreEscapedLikeSwift()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = "media/ภาพ ทดสอบ.mp4";
        project.Scenes[0].Name = "ภาพ / ทดสอบ";

        var text = ProjectJson.SerializeToString(project);
        Assert.Contains("media\\/ภาพ ทดสอบ.mp4", text);
        Assert.Contains("ภาพ \\/ ทดสอบ", text);

        var roundTrip = ProjectJson.Deserialize(text);
        Assert.Equal("media/ภาพ ทดสอบ.mp4", roundTrip.Scenes[0].Media);
        Assert.Equal("ภาพ / ทดสอบ", roundTrip.Scenes[0].Name);
    }

    [Fact]
    public void MalformedJsonThrowsRelightJsonException()
    {
        Assert.Throws<RelightJsonException>(() => ProjectJson.Deserialize("{"));
    }

    [Fact]
    public void WholeDoublesAreWrittenWithoutDecimalPoint()
    {
        var project = Project.CreateStarter();
        var text = ProjectJson.SerializeToString(project);

        Assert.Contains("\"durationSeconds\" : 6,", text);
        Assert.Contains("\"outputOffsetMs\" : 0,", text);
        Assert.DoesNotContain("6.0", text);
    }

    private static JsonObject MinimalProject() => JsonNode.Parse(
        $$"""
        {
          "schemaVersion": 1,
          "title": "Minimal",
          "rate": { "numerator": 24, "denominator": 1 },
          "filmLevel": 0.75,
          "voiceLevel": 0.85,
          "duckLevel": 0.35,
          "outputOffsetMs": 0,
          "effectPresets": {},
          "scenes": [
            {
              "id": "{{SceneId}}",
              "name": "Scene",
              "thai": "ฉาก",
              "frames": 24,
              "mediaInFrame": 0,
              "draft": true,
              "cues": []
            }
          ]
        }
        """)!.AsObject();

    private static void AddCue(JsonObject project, bool includeFeedback)
    {
        var effects = new JsonObject
        {
            ["level"] = 0.8,
            ["lowPassHz"] = 18000,
            ["delayMs"] = 0,
            ["feedback"] = 0,
            ["reverbWet"] = 0,
            ["distortion"] = 0,
            ["pan"] = 0
        };

        if (!includeFeedback)
        {
            effects.Remove("feedback");
        }

        project["scenes"]![0]!.AsObject()["cues"] = new JsonArray(new JsonObject
        {
            ["id"] = CueId,
            ["name"] = "Visitor voice",
            ["startFrame"] = 0,
            ["lengthFrames"] = 12,
            ["sourceInFrame"] = 0,
            ["fadeInFrames"] = 2,
            ["fadeOutFrames"] = 6,
            ["bypass"] = false,
            ["effects"] = effects,
            ["automation"] = new JsonObject()
        });
    }
}
