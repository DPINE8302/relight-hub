namespace RELight.Controls;

public sealed record HidLearnElement(
    string DeviceId,
    string ElementId,
    int ReleasedValue,
    int PressedValue);

public enum HidLearningUpdateKind
{
    Ignored,
    FirstPress,
    Progress,
    Complete
}

public sealed record HidLearningUpdate(
    HidLearningUpdateKind Kind,
    HidLearnElement? Element = null,
    int CompletedPresses = 0);

/// <summary>
/// Matches the Mac learning flow: one candidate element, two complete
/// press/release cycles, a 35 ms bounce filter, and support for active-low
/// controls. Any other element or held value is ignored.
/// </summary>
public sealed class HidLearningTracker
{
    private readonly long _minimumTransitionIntervalMs;
    private HidLearnElement? _candidate;
    private bool _awaitingRelease;
    private long? _lastTransitionAtMs;
    private int _completedPresses;

    public HidLearningTracker(long minimumTransitionIntervalMs = 35)
    {
        if (minimumTransitionIntervalMs < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(minimumTransitionIntervalMs));
        }

        _minimumTransitionIntervalMs = minimumTransitionIntervalMs;
    }

    public HidLearnElement? Candidate => _candidate;

    public int CompletedPresses => _completedPresses;

    public HidLearningUpdate Observe(
        string deviceId,
        string elementId,
        int previousValue,
        int value,
        long occurredAtMs)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(deviceId);
        ArgumentException.ThrowIfNullOrWhiteSpace(elementId);
        if (value == previousValue)
        {
            return new HidLearningUpdate(HidLearningUpdateKind.Ignored);
        }

        if (_lastTransitionAtMs is { } last &&
            occurredAtMs - last < _minimumTransitionIntervalMs)
        {
            return new HidLearningUpdate(HidLearningUpdateKind.Ignored);
        }

        if (_candidate is null)
        {
            _candidate = new HidLearnElement(deviceId, elementId, previousValue, value);
            _awaitingRelease = true;
            _lastTransitionAtMs = occurredAtMs;
            return new HidLearningUpdate(HidLearningUpdateKind.FirstPress, _candidate);
        }

        if (_candidate.DeviceId != deviceId || _candidate.ElementId != elementId)
        {
            return new HidLearningUpdate(HidLearningUpdateKind.Ignored);
        }

        if (_awaitingRelease)
        {
            if (value != _candidate.ReleasedValue)
            {
                return new HidLearningUpdate(HidLearningUpdateKind.Ignored);
            }

            _completedPresses++;
            _awaitingRelease = false;
            _lastTransitionAtMs = occurredAtMs;
            return _completedPresses >= 2
                ? new HidLearningUpdate(HidLearningUpdateKind.Complete, _candidate, _completedPresses)
                : new HidLearningUpdate(HidLearningUpdateKind.Progress, _candidate, _completedPresses);
        }

        if (value != _candidate.PressedValue)
        {
            return new HidLearningUpdate(HidLearningUpdateKind.Ignored);
        }

        _awaitingRelease = true;
        _lastTransitionAtMs = occurredAtMs;
        return new HidLearningUpdate(HidLearningUpdateKind.Progress, _candidate, _completedPresses);
    }
}
