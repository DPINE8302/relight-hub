using System.Text;
using System.Text.Json;

namespace RELight.Core.Json;

/// <summary>
/// Schema-1 project reader/writer. The writer reproduces the bytes emitted by
/// Swift's <c>JSONEncoder</c> with <c>[.prettyPrinted, .sortedKeys]</c>; the
/// reader enforces the same required/optional keys and enum literals.
/// </summary>
public static class ProjectJson
{
    public static string SerializeToString(Project project)
    {
        ArgumentNullException.ThrowIfNull(project);
        var writer = new JsonTextWriter();
        WriteProject(writer, project);
        return writer.ToString();
    }

    public static byte[] Serialize(Project project) => Encoding.UTF8.GetBytes(SerializeToString(project));

    public static Project Deserialize(string json)
    {
        ArgumentNullException.ThrowIfNull(json);
        return Deserialize(Encoding.UTF8.GetBytes(json));
    }

    public static Project Deserialize(byte[] utf8Json)
    {
        ArgumentNullException.ThrowIfNull(utf8Json);
        try
        {
            using var document = JsonDocument.Parse(utf8Json);
            return ReadProject(document.RootElement);
        }
        catch (JsonException exception)
        {
            throw new RelightJsonException("Invalid project JSON: " + exception.Message, exception);
        }
    }

    private static void WriteProject(JsonTextWriter writer, Project project)
    {
        var properties = new List<(string Key, Action<JsonTextWriter> Write)>
        {
            ("schemaVersion", w => w.WriteNumber(project.SchemaVersion)),
            ("title", w => w.WriteString(project.Title)),
            ("rate", w => WriteFrameRate(w, project.Rate)),
            ("filmLevel", w => w.WriteNumber(project.FilmLevel)),
            ("voiceLevel", w => w.WriteNumber(project.VoiceLevel)),
            ("duckLevel", w => w.WriteNumber(project.DuckLevel)),
            ("outputOffsetMs", w => w.WriteNumber(project.OutputOffsetMs)),
            ("effectPresets", w => WriteEffectPresets(w, project.EffectPresets)),
            ("scenes", w => WriteScenes(w, project.Scenes))
        };

        if (project.BlackFromFrame is long blackFromFrame)
        {
            properties.Add(("blackFromFrame", w => w.WriteNumber(blackFromFrame)));
        }

        WriteObject(writer, properties.ToArray());
    }

    private static void WriteFrameRate(JsonTextWriter writer, FrameRate rate) =>
        WriteObject(
            writer,
            ("denominator", w => w.WriteNumber(rate.Denominator)),
            ("numerator", w => w.WriteNumber(rate.Numerator)));

    private static void WriteEffectSettings(JsonTextWriter writer, EffectSettings effects)
    {
        var properties = new List<(string Key, Action<JsonTextWriter> Write)>
        {
            ("level", w => w.WriteNumber(effects.Level)),
            ("lowPassHz", w => w.WriteNumber(effects.LowPassHz)),
            ("delayMs", w => w.WriteNumber(effects.DelayMs)),
            ("feedback", w => w.WriteNumber(effects.Feedback)),
            ("reverbWet", w => w.WriteNumber(effects.ReverbWet)),
            ("distortion", w => w.WriteNumber(effects.Distortion)),
            ("pan", w => w.WriteNumber(effects.Pan))
        };

        if (effects.DelayWet is double delayWet)
        {
            properties.Add(("delayWet", w => w.WriteNumber(delayWet)));
        }

        WriteObject(writer, properties.ToArray());
    }

    private static void WriteEffectPresets(JsonTextWriter writer, Dictionary<string, EffectSettings> presets)
    {
        writer.WriteStartObject();
        foreach (var key in presets.Keys.OrderBy(key => key, StringComparer.Ordinal))
        {
            writer.WritePropertyName(key);
            WriteEffectSettings(writer, presets[key]);
        }

        writer.WriteEndObject();
    }

    private static void WriteScenes(JsonTextWriter writer, List<Scene> scenes)
    {
        writer.WriteStartArray();
        foreach (var scene in scenes)
        {
            WriteScene(writer, scene);
        }

        writer.WriteEndArray();
    }

    private static void WriteScene(JsonTextWriter writer, Scene scene)
    {
        var properties = new List<(string Key, Action<JsonTextWriter> Write)>
        {
            ("id", w => WriteUuid(w, scene.Id)),
            ("name", w => w.WriteString(scene.Name)),
            ("thai", w => w.WriteString(scene.Thai)),
            ("frames", w => w.WriteNumber(scene.Frames)),
            ("mediaInFrame", w => w.WriteNumber(scene.MediaInFrame)),
            ("draft", w => w.WriteBoolean(scene.Draft)),
            ("cues", w => WriteCues(w, scene.Cues))
        };

        if (scene.Media is string media)
        {
            properties.Add(("media", w => w.WriteString(media)));
        }

        if (scene.Capture is CaptureCue capture)
        {
            properties.Add(("capture", w => WriteCaptureCue(w, capture)));
        }

        WriteObject(writer, properties.ToArray());
    }

    private static void WriteCues(JsonTextWriter writer, List<VoiceCue> cues)
    {
        writer.WriteStartArray();
        foreach (var cue in cues)
        {
            WriteVoiceCue(writer, cue);
        }

        writer.WriteEndArray();
    }

    private static void WriteVoiceCue(JsonTextWriter writer, VoiceCue cue)
    {
        var properties = new List<(string Key, Action<JsonTextWriter> Write)>
        {
            ("id", w => WriteUuid(w, cue.Id)),
            ("name", w => w.WriteString(cue.Name)),
            ("startFrame", w => w.WriteNumber(cue.StartFrame)),
            ("lengthFrames", w => w.WriteNumber(cue.LengthFrames)),
            ("sourceInFrame", w => w.WriteNumber(cue.SourceInFrame)),
            ("fadeInFrames", w => w.WriteNumber(cue.FadeInFrames)),
            ("fadeOutFrames", w => w.WriteNumber(cue.FadeOutFrames)),
            ("bypass", w => w.WriteBoolean(cue.Bypass)),
            ("effects", w => WriteEffectSettings(w, cue.Effects)),
            ("automation", w => WriteAutomation(w, cue.Automation))
        };

        if (cue.RepeatCount is long repeatCount)
        {
            properties.Add(("repeatCount", w => w.WriteNumber(repeatCount)));
        }

        if (cue.LoopToFill is bool loopToFill)
        {
            properties.Add(("loopToFill", w => w.WriteBoolean(loopToFill)));
        }

        WriteObject(writer, properties.ToArray());
    }

    private static void WriteAutomation(JsonTextWriter writer, Dictionary<string, List<AutomationPoint>> automation)
    {
        writer.WriteStartObject();
        foreach (var key in automation.Keys.OrderBy(key => key, StringComparer.Ordinal))
        {
            writer.WritePropertyName(key);
            writer.WriteStartArray();
            foreach (var point in automation[key])
            {
                WriteObject(
                    writer,
                    ("frame", w => w.WriteNumber(point.Frame)),
                    ("id", w => WriteUuid(w, point.Id)),
                    ("value", w => w.WriteNumber(point.Value)));
            }

            writer.WriteEndArray();
        }

        writer.WriteEndObject();
    }

    private static void WriteCaptureCue(JsonTextWriter writer, CaptureCue capture)
    {
        var properties = new List<(string Key, Action<JsonTextWriter> Write)>
        {
            ("trigger", w => w.WriteString(CaptureNames.JsonName(capture.Trigger))),
            ("startFrame", w => w.WriteNumber(capture.StartFrame)),
            ("durationSeconds", w => w.WriteNumber(capture.DurationSeconds))
        };

        if (capture.Mode is CaptureMode mode)
        {
            properties.Add(("mode", w => w.WriteString(CaptureNames.JsonName(mode))));
        }

        if (capture.GateFrame is long gateFrame)
        {
            properties.Add(("gateFrame", w => w.WriteNumber(gateFrame)));
        }

        WriteObject(writer, properties.ToArray());
    }

    private static void WriteObject(
        JsonTextWriter writer,
        params (string Key, Action<JsonTextWriter> Write)[] properties)
    {
        Array.Sort(properties, (left, right) => string.CompareOrdinal(left.Key, right.Key));
        writer.WriteStartObject();
        foreach (var (key, write) in properties)
        {
            writer.WritePropertyName(key);
            write(writer);
        }

        writer.WriteEndObject();
    }

    private static void WriteUuid(JsonTextWriter writer, Guid id) =>
        writer.WriteString(id.ToString("D").ToUpperInvariant());

    private static Project ReadProject(JsonElement root)
    {
        RequireKind(root, JsonValueKind.Object, "project");
        return new Project
        {
            SchemaVersion = RequireInt64(root, "schemaVersion"),
            Title = RequireString(root, "title"),
            Rate = ReadFrameRate(RequireObject(root, "rate")),
            FilmLevel = RequireDouble(root, "filmLevel"),
            VoiceLevel = RequireDouble(root, "voiceLevel"),
            DuckLevel = RequireDouble(root, "duckLevel"),
            OutputOffsetMs = RequireDouble(root, "outputOffsetMs"),
            EffectPresets = ReadEffectPresets(RequireObject(root, "effectPresets")),
            BlackFromFrame = OptionalInt64(root, "blackFromFrame"),
            Scenes = ReadScenes(RequireArray(root, "scenes"))
        };
    }

    private static FrameRate ReadFrameRate(JsonElement element) => new()
    {
        Numerator = RequireInt64(element, "numerator"),
        Denominator = RequireInt64(element, "denominator")
    };

    private static Dictionary<string, EffectSettings> ReadEffectPresets(JsonElement element)
    {
        var presets = new Dictionary<string, EffectSettings>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            presets[property.Name] = ReadEffectSettings(RequireObjectValue(property.Value, property.Name));
        }

        return presets;
    }

    private static EffectSettings ReadEffectSettings(JsonElement element) => new()
    {
        Level = RequireDouble(element, "level"),
        LowPassHz = RequireDouble(element, "lowPassHz"),
        DelayMs = RequireDouble(element, "delayMs"),
        DelayWet = OptionalDouble(element, "delayWet"),
        Feedback = RequireDouble(element, "feedback"),
        ReverbWet = RequireDouble(element, "reverbWet"),
        Distortion = RequireDouble(element, "distortion"),
        Pan = RequireDouble(element, "pan")
    };

    private static List<Scene> ReadScenes(JsonElement element)
    {
        var scenes = new List<Scene>();
        foreach (var scene in element.EnumerateArray())
        {
            RequireKind(scene, JsonValueKind.Object, "scene");
            scenes.Add(ReadScene(scene));
        }

        return scenes;
    }

    private static Scene ReadScene(JsonElement element)
    {
        var scene = new Scene
        {
            Id = RequireUuid(element, "id"),
            Name = RequireString(element, "name"),
            Thai = RequireString(element, "thai"),
            Frames = RequireInt64(element, "frames"),
            Media = OptionalString(element, "media"),
            MediaInFrame = RequireInt64(element, "mediaInFrame"),
            Draft = RequireBool(element, "draft"),
            Cues = ReadCues(RequireArray(element, "cues"))
        };

        var capture = OptionalObject(element, "capture");
        if (capture is JsonElement captureElement)
        {
            scene.Capture = ReadCaptureCue(captureElement);
        }

        return scene;
    }

    private static List<VoiceCue> ReadCues(JsonElement element)
    {
        var cues = new List<VoiceCue>();
        foreach (var cue in element.EnumerateArray())
        {
            RequireKind(cue, JsonValueKind.Object, "voice cue");
            cues.Add(ReadVoiceCue(cue));
        }

        return cues;
    }

    private static VoiceCue ReadVoiceCue(JsonElement element) => new()
    {
        Id = RequireUuid(element, "id"),
        Name = RequireString(element, "name"),
        StartFrame = RequireInt64(element, "startFrame"),
        LengthFrames = RequireInt64(element, "lengthFrames"),
        SourceInFrame = RequireInt64(element, "sourceInFrame"),
        FadeInFrames = RequireInt64(element, "fadeInFrames"),
        FadeOutFrames = RequireInt64(element, "fadeOutFrames"),
        Bypass = RequireBool(element, "bypass"),
        RepeatCount = OptionalInt64(element, "repeatCount"),
        LoopToFill = OptionalBool(element, "loopToFill"),
        Effects = ReadEffectSettings(RequireObject(element, "effects")),
        Automation = ReadAutomation(RequireObject(element, "automation"))
    };

    private static Dictionary<string, List<AutomationPoint>> ReadAutomation(JsonElement element)
    {
        var automation = new Dictionary<string, List<AutomationPoint>>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            RequireKind(property.Value, JsonValueKind.Array, $"automation '{property.Name}'");
            var points = new List<AutomationPoint>();
            foreach (var point in property.Value.EnumerateArray())
            {
                RequireKind(point, JsonValueKind.Object, "automation point");
                points.Add(new AutomationPoint
                {
                    Id = RequireUuid(point, "id"),
                    Frame = RequireInt64(point, "frame"),
                    Value = RequireDouble(point, "value")
                });
            }

            automation[property.Name] = points;
        }

        return automation;
    }

    private static CaptureCue ReadCaptureCue(JsonElement element)
    {
        var triggerText = RequireString(element, "trigger");
        if (!CaptureNames.TryParse(triggerText, out CaptureTrigger trigger))
        {
            throw new RelightJsonException($"Invalid capture trigger '{triggerText}'.");
        }

        var capture = new CaptureCue
        {
            Trigger = trigger,
            StartFrame = RequireInt64(element, "startFrame"),
            DurationSeconds = RequireDouble(element, "durationSeconds"),
            GateFrame = OptionalInt64(element, "gateFrame")
        };

        var modeText = OptionalString(element, "mode");
        if (modeText is not null)
        {
            if (!CaptureNames.TryParse(modeText, out CaptureMode mode))
            {
                throw new RelightJsonException($"Invalid capture mode '{modeText}'.");
            }

            capture.Mode = mode;
        }

        return capture;
    }

    private static JsonElement Require(JsonElement parent, string name)
    {
        if (!parent.TryGetProperty(name, out var value))
        {
            throw new RelightJsonException($"Missing required property '{name}'.");
        }

        return value;
    }

    private static JsonElement RequireObject(JsonElement parent, string name)
    {
        var value = Require(parent, name);
        RequireKind(value, JsonValueKind.Object, name);
        return value;
    }

    private static JsonElement? OptionalObject(JsonElement parent, string name)
    {
        if (!parent.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        RequireKind(value, JsonValueKind.Object, name);
        return value;
    }

    private static JsonElement RequireArray(JsonElement parent, string name)
    {
        var value = Require(parent, name);
        RequireKind(value, JsonValueKind.Array, name);
        return value;
    }

    private static JsonElement RequireObjectValue(JsonElement value, string name)
    {
        RequireKind(value, JsonValueKind.Object, name);
        return value;
    }

    private static string RequireString(JsonElement parent, string name)
    {
        var value = Require(parent, name);
        return RequireStringValue(value, name);
    }

    private static string RequireStringValue(JsonElement value, string name)
    {
        RequireKind(value, JsonValueKind.String, name);
        return value.GetString() ?? throw new RelightJsonException($"Property '{name}' must be a string.");
    }

    private static string? OptionalString(JsonElement parent, string name)
    {
        if (!parent.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return RequireStringValue(value, name);
    }

    private static bool RequireBool(JsonElement parent, string name)
    {
        var value = Require(parent, name);
        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => throw new RelightJsonException($"Property '{name}' must be a boolean.")
        };
    }

    private static bool? OptionalBool(JsonElement parent, string name)
    {
        if (!parent.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => throw new RelightJsonException($"Property '{name}' must be a boolean.")
        };
    }

    private static long RequireInt64(JsonElement parent, string name)
    {
        var value = Require(parent, name);
        return Int64Value(value, name);
    }

    private static long? OptionalInt64(JsonElement parent, string name)
    {
        if (!parent.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return Int64Value(value, name);
    }

    private static long Int64Value(JsonElement value, string name)
    {
        if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt64(out var result))
        {
            throw new RelightJsonException($"Property '{name}' must be a 64-bit integer.");
        }

        return result;
    }

    private static double RequireDouble(JsonElement parent, string name)
    {
        var value = Require(parent, name);
        return DoubleValue(value, name);
    }

    private static double? OptionalDouble(JsonElement parent, string name)
    {
        if (!parent.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return DoubleValue(value, name);
    }

    private static double DoubleValue(JsonElement value, string name)
    {
        if (value.ValueKind != JsonValueKind.Number ||
            !value.TryGetDouble(out var result) ||
            !double.IsFinite(result))
        {
            throw new RelightJsonException($"Property '{name}' must be a finite number.");
        }

        return result;
    }

    private static Guid RequireUuid(JsonElement parent, string name)
    {
        var value = RequireString(parent, name);
        if (!IsCanonicalUuid(value) || !Guid.TryParse(value, out var result))
        {
            throw new RelightJsonException($"Property '{name}' must be a UUID.");
        }

        return result;
    }

    private static bool IsCanonicalUuid(string value)
    {
        if (value.Length != 36)
        {
            return false;
        }

        for (var index = 0; index < value.Length; index++)
        {
            if (index is 8 or 13 or 18 or 23)
            {
                if (value[index] != '-')
                {
                    return false;
                }
            }
            else if (!Uri.IsHexDigit(value[index]))
            {
                return false;
            }
        }

        return true;
    }

    private static void RequireKind(JsonElement value, JsonValueKind kind, string name)
    {
        if (value.ValueKind != kind)
        {
            throw new RelightJsonException($"Property '{name}' must be {kind.ToString().ToLowerInvariant()}.");
        }
    }
}
