namespace RELight.Core;

public enum PowerSource
{
    Unknown,
    AlternatingCurrent,
    Battery
}

/// <summary>
/// Exhibition is fail-closed: only a known AC supply allows a run. A battery,
/// an unknown state, or a platform that cannot answer all block the show.
/// </summary>
public static class PowerPolicy
{
    public static bool CanRunExhibition(PowerSource source) => source == PowerSource.AlternatingCurrent;

    public static bool CanRunExhibition(PowerSource source, bool powerStateKnown) =>
        powerStateKnown && CanRunExhibition(source);
}
