namespace RELight.Controls;

public enum ControlAction
{
    None,
    RecordAtGate,
    FinishRecording,
    DeclineAtGate
}

public static class ControlActionPolicy
{
    public const double MinimumRecordingSeconds = 0.2;

    /// <summary>
    /// Mirrors the Mac <c>hardware.onInput</c> handler. Record starts a take at
    /// the gate and may stop a take after 0.2 s; Choice declines only at the
    /// gate. Wrong-state presses are ignored and never queue an action.
    /// </summary>
    public static ControlAction Resolve(
        ControlRole role,
        bool atGate,
        bool recording,
        double recordingSeconds)
    {
        if (role == ControlRole.Record)
        {
            if (atGate)
            {
                return ControlAction.RecordAtGate;
            }

            return recording && recordingSeconds >= MinimumRecordingSeconds
                ? ControlAction.FinishRecording
                : ControlAction.None;
        }

        return atGate ? ControlAction.DeclineAtGate : ControlAction.None;
    }
}

/// <summary>
/// Accepts only assigned elements, requires a press edge and release before the
/// next press, and debounces repeated accepted presses by 250 ms. The same
/// class is responsible for marking a control as freshly tested, so an
/// assignment alone can never satisfy exhibition readiness.
/// </summary>
public sealed class ControlEdgeRouter
{
    public const long DebounceMilliseconds = 250;

    private readonly object _gate = new();
    private readonly Dictionary<ControlRole, ControlBinding> _bindings = [];
    private readonly Dictionary<string, int> _previousValues = new(StringComparer.Ordinal);
    private readonly HashSet<string> _initialized = new(StringComparer.Ordinal);
    private readonly Dictionary<ControlRole, long> _lastPress = [];
    private readonly HashSet<ControlRole> _tested = [];
    private readonly Func<long> _clock;

    public ControlEdgeRouter(Func<long>? clock = null)
    {
        _clock = clock ?? (() => Environment.TickCount64);
    }

    public IReadOnlyList<ControlBinding> Bindings
    {
        get
        {
            lock (_gate)
            {
                return _bindings.Values.Select(binding => binding.Clone()).ToArray();
            }
        }
    }

    public void SetBindings(IEnumerable<ControlBinding> bindings)
    {
        ArgumentNullException.ThrowIfNull(bindings);
        lock (_gate)
        {
            _bindings.Clear();
            _previousValues.Clear();
            _initialized.Clear();
            foreach (var binding in bindings)
            {
                if (binding.Validate().Count > 0)
                {
                    continue;
                }

                _bindings[binding.ParsedRole] = binding.Clone();
            }
        }
    }

    public ControlBinding? BindingFor(ControlRole role)
    {
        lock (_gate)
        {
            return _bindings.TryGetValue(role, out var binding) ? binding.Clone() : null;
        }
    }

    public bool IsTested(ControlRole role)
    {
        lock (_gate)
        {
            return _tested.Contains(role);
        }
    }

    public bool IsConnected(ControlRole role, IEnumerable<string> connectedDeviceIds)
    {
        ArgumentNullException.ThrowIfNull(connectedDeviceIds);
        lock (_gate)
        {
            return _bindings.TryGetValue(role, out var binding) &&
                   connectedDeviceIds.Contains(binding.DeviceId, StringComparer.Ordinal);
        }
    }

    public void ClearTested()
    {
        lock (_gate)
        {
            _tested.Clear();
        }
    }

    /// <summary>
    /// Updates the previous value for an element and returns a role only when a
    /// new, debounced press edge belongs to a binding. Releases clear the latch
    /// so the next press is accepted.
    /// </summary>
    public ControlRole? Observe(string deviceId, string elementId, int value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(deviceId);
        ArgumentException.ThrowIfNullOrWhiteSpace(elementId);

        lock (_gate)
        {
            var key = deviceId + "\0" + elementId;
            if (!_initialized.Contains(key))
            {
                _initialized.Add(key);
                _previousValues[key] = value;
                return null;
            }

            _previousValues.TryGetValue(key, out var previous);
            _previousValues[key] = value;
            if (value == previous)
            {
                return null;
            }

            ControlRole? matchedRole = null;
            foreach (var (role, candidate) in _bindings)
            {
                if (candidate.DeviceId == deviceId && candidate.ElementId == elementId)
                {
                    matchedRole = role;
                    break;
                }
            }

            if (matchedRole is null)
            {
                return null;
            }

            var binding = _bindings[matchedRole.Value];
            if (value != binding.PressedValue)
            {
                return null;
            }

            var now = _clock();
            if (_lastPress.TryGetValue(matchedRole.Value, out var last) &&
                now - last < DebounceMilliseconds)
            {
                return null;
            }

            _lastPress[matchedRole.Value] = now;
            _tested.Add(matchedRole.Value);
            binding.LastSeenAt = now;
            return matchedRole;
        }
    }
}
