using System.Text.Json;
using System.Text.Json.Serialization;

namespace RELight.Controls;

/// <summary>
/// A persisted assignment from one physical HID element to one show role.
/// Field names follow the Mac helper's wire binding so diagnostics remain
/// comparable. Bindings are machine-local and are never part of a project.
/// </summary>
public sealed class ControlBinding
{
    [JsonPropertyName("role")]
    public string Role { get; set; } = "";

    [JsonPropertyName("deviceId")]
    public string DeviceId { get; set; } = "";

    [JsonPropertyName("deviceLabel")]
    public string DeviceLabel { get; set; } = "";

    [JsonPropertyName("elementId")]
    public string ElementId { get; set; } = "";

    [JsonPropertyName("elementLabel")]
    public string ElementLabel { get; set; } = "";

    [JsonPropertyName("usagePage")]
    public int UsagePage { get; set; }

    [JsonPropertyName("usage")]
    public int Usage { get; set; }

    [JsonPropertyName("reportId")]
    public int ReportId { get; set; }

    [JsonPropertyName("logicalMinimum")]
    public int LogicalMinimum { get; set; }

    [JsonPropertyName("logicalMaximum")]
    public int LogicalMaximum { get; set; }

    [JsonPropertyName("releasedValue")]
    public int ReleasedValue { get; set; }

    [JsonPropertyName("pressedValue")]
    public int PressedValue { get; set; }

    [JsonPropertyName("identityQuality")]
    public string IdentityQuality { get; set; } = "";

    [JsonPropertyName("locationBound")]
    public bool LocationBound { get; set; }

    [JsonPropertyName("assignedAt")]
    public long AssignedAt { get; set; }

    [JsonPropertyName("lastSeenAt")]
    public long? LastSeenAt { get; set; }

    [JsonIgnore]
    public ControlRole ParsedRole =>
        ControlRoles.TryParseWireName(Role, out var role)
            ? role
            : throw new InvalidOperationException($"Unknown control role '{Role}'.");

    public ControlBinding Clone() => new()
    {
        Role = Role,
        DeviceId = DeviceId,
        DeviceLabel = DeviceLabel,
        ElementId = ElementId,
        ElementLabel = ElementLabel,
        UsagePage = UsagePage,
        Usage = Usage,
        ReportId = ReportId,
        LogicalMinimum = LogicalMinimum,
        LogicalMaximum = LogicalMaximum,
        ReleasedValue = ReleasedValue,
        PressedValue = PressedValue,
        IdentityQuality = IdentityQuality,
        LocationBound = LocationBound,
        AssignedAt = AssignedAt,
        LastSeenAt = LastSeenAt
    };

    public IReadOnlyList<string> Validate()
    {
        var issues = new List<string>();
        if (!ControlRoles.TryParseWireName(Role, out _))
        {
            issues.Add("Control role is not recognized");
        }

        if (string.IsNullOrWhiteSpace(DeviceId) || DeviceId.Length > 200)
        {
            issues.Add("Device identity is missing or too long");
        }

        if (string.IsNullOrWhiteSpace(ElementId) || ElementId.Length > 200)
        {
            issues.Add("Element identity is missing or too long");
        }

        if (DeviceLabel.Length > 300 || ElementLabel.Length > 300)
        {
            issues.Add("Device or element label is too long");
        }

        if (UsagePage is not (HidElementPolicy.ButtonPage or HidElementPolicy.KeyboardOrKeypadPage))
        {
            issues.Add("Only button and keyboard controls can be assigned");
        }

        if (PressedValue == ReleasedValue ||
            Math.Abs((long)PressedValue - ReleasedValue) != 1)
        {
            issues.Add("The control must report a binary press and release");
        }

        if (AssignedAt < 0)
        {
            issues.Add("Assignment timestamp is invalid");
        }

        return issues;
    }
}

public static class ControlBindingStore
{
    private const int MaximumBytes = 1_048_576;

    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public static IReadOnlyList<ControlBinding> Load(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        if (!File.Exists(path))
        {
            return [];
        }

        var info = new FileInfo(path);
        if (info.Length is <= 0 or > MaximumBytes)
        {
            return [];
        }

        try
        {
            var bindings = JsonSerializer.Deserialize<List<ControlBinding>>(File.ReadAllText(path), Options) ?? [];
            var valid = new List<ControlBinding>();
            var roles = new HashSet<ControlRole>();
            foreach (var binding in bindings)
            {
                if (binding.Validate().Count > 0)
                {
                    continue;
                }

                if (!roles.Add(binding.ParsedRole))
                {
                    continue;
                }

                valid.Add(binding);
            }

            return valid;
        }
        catch (Exception exception) when (exception is IOException or JsonException or UnauthorizedAccessException)
        {
            return [];
        }
    }

    public static void Save(string path, IEnumerable<ControlBinding> bindings)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        ArgumentNullException.ThrowIfNull(bindings);

        var valid = new List<ControlBinding>();
        var roles = new HashSet<ControlRole>();
        foreach (var binding in bindings)
        {
            if (binding.Validate().Count > 0)
            {
                throw new ArgumentException("A control binding is invalid.", nameof(bindings));
            }

            if (!roles.Add(binding.ParsedRole))
            {
                throw new ArgumentException("Each control role can have only one binding.", nameof(bindings));
            }

            valid.Add(binding);
        }

        var directory = Path.GetDirectoryName(Path.GetFullPath(path));
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var temporary = path + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(valid, Options));
        File.Move(temporary, path, overwrite: true);
    }
}
