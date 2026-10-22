namespace RELight.Core;

/// <summary>
/// Fires each cue at most once per run. Seeking skips every cue whose start is
/// at or before the seek target. Mirrors <c>CueLedger</c> in the Swift core.
/// </summary>
public sealed class CueLedger
{
    private readonly HashSet<Guid> _fired = [];

    public void Reset() => _fired.Clear();

    public void Skip(long throughFrame, IEnumerable<VoiceCue> cues)
    {
        foreach (var cue in cues)
        {
            if (cue.StartFrame <= throughFrame)
            {
                _fired.Add(cue.Id);
            }
        }
    }

    public List<VoiceCue> Due(long throughFrame, IEnumerable<VoiceCue> cues)
    {
        var due = new List<VoiceCue>();
        foreach (var cue in cues)
        {
            if (cue.StartFrame <= throughFrame && _fired.Add(cue.Id))
            {
                due.Add(cue);
            }
        }

        due.Sort((left, right) => left.StartFrame.CompareTo(right.StartFrame));
        return due;
    }
}
