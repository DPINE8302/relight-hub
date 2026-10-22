namespace RELight.Controls;

/// <summary>
/// The two physical controls in the exhibition kit. Wire names match the Mac
/// helper's role strings so learning and diagnostics read the same on both
/// platforms.
/// </summary>
public enum ControlRole
{
    Record,
    Choice
}

public static class ControlRoles
{
    public const string RecordWireName = "RECORD_BUTTON";
    public const string ChoiceWireName = "CHOICE_BUTTON";

    public static string WireName(this ControlRole role) => role switch
    {
        ControlRole.Record => RecordWireName,
        ControlRole.Choice => ChoiceWireName,
        _ => throw new ArgumentOutOfRangeException(nameof(role))
    };

    public static string DisplayName(this ControlRole role) => role switch
    {
        ControlRole.Record => "Record / Consent",
        ControlRole.Choice => "Continue / Decline",
        _ => throw new ArgumentOutOfRangeException(nameof(role))
    };

    public static string ShortName(this ControlRole role) => role switch
    {
        ControlRole.Record => "Record",
        ControlRole.Choice => "Continue / Decline",
        _ => throw new ArgumentOutOfRangeException(nameof(role))
    };

    public static bool TryParseWireName(string? value, out ControlRole role)
    {
        switch (value)
        {
            case RecordWireName:
                role = ControlRole.Record;
                return true;
            case ChoiceWireName:
                role = ControlRole.Choice;
                return true;
            default:
                role = default;
                return false;
        }
    }
}
