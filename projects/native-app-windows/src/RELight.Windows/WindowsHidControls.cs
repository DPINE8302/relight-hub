using HidSharp;
using HidSharp.Reports;
using HidSharp.Reports.Input;
using RELight.Controls;

namespace RELight.Windows;

public sealed record HidControlDevice(
    string Id,
    string Label,
    string Manufacturer,
    int VendorId,
    int ProductId,
    string IdentityQuality,
    string IdentityNote,
    bool LocationBound,
    bool Connected,
    bool Assignable,
    int AssignableElementCount,
    string? Reason);

public sealed record HidControlStatus(
    bool Available,
    string Message,
    IReadOnlyList<HidControlDevice> Devices,
    IReadOnlyList<ControlBinding> Bindings,
    ControlRole? LearningRole,
    bool RecordTested,
    bool ChoiceTested);

/// <summary>
/// In-process Windows HID control service. HidSharp enumerates devices and
/// parses report descriptors; a background reader observes only binary input
/// elements that pass <see cref="HidElementPolicy"/>. Raw reports and serial
/// numbers are never logged, persisted or exported. This adapter is compiled
/// but requires the physical encoder and a Windows machine for verification.
/// </summary>
public sealed class WindowsHidControlService : IDisposable
{
    private sealed class DeviceSession
    {
        public required HidDevice Device { get; init; }
        public required string Id { get; init; }
        public required string Label { get; init; }
        public required string Manufacturer { get; init; }
        public required string IdentityQuality { get; init; }
        public required string IdentityNote { get; init; }
        public required bool LocationBound { get; init; }
        public required Dictionary<string, ElementSession> Elements { get; init; }
        public required List<string> ElementOrder { get; init; }
        public required string? Reason { get; init; }
        public ReportDescriptor? Descriptor { get; set; }
        public HidStream? Stream { get; set; }
        public HidDeviceInputReceiver? Receiver { get; set; }
        public Thread? Reader { get; set; }
        public CancellationTokenSource? Cancellation { get; set; }
    }

    private sealed class ElementSession
    {
        public required string DeviceId { get; init; }
        public required string DeviceLabel { get; init; }
        public required string ElementId { get; init; }
        public required string ElementLabel { get; init; }
        public required int UsagePage { get; init; }
        public required int Usage { get; init; }
        public required int ReportId { get; init; }
        public required int DataItemIndex { get; init; }
        public required int ElementIndex { get; init; }
        public required bool IsArray { get; init; }
        public required int LogicalMinimum { get; init; }
        public required int LogicalMaximum { get; init; }
        public required string IdentityQuality { get; init; }
        public required bool LocationBound { get; init; }
        public int LastValue { get; set; }
        public bool Initialized { get; set; }
    }

    private readonly object _gate = new();
    private readonly object _enumerationGate = new();
    private readonly DeviceList _deviceList = DeviceList.Local;
    private readonly ControlEdgeRouter _router = new();
    private readonly string _settingsPath;
    private readonly string _sessionId = Guid.NewGuid().ToString("N");
    private readonly Dictionary<string, DeviceSession> _sessions = new(StringComparer.Ordinal);
    private readonly List<HidControlDevice> _devices = [];
    private readonly CancellationTokenSource _shutdown = new();
    private Thread? _monitor;
    private HidLearningTracker? _learning;
    private ControlRole? _learningRole;
    private string _message = "USB controls are not available yet.";
    private bool _productionMode;
    private bool _disposed;

    public WindowsHidControlService(string? settingsPath = null)
    {
        _settingsPath = settingsPath ?? Path.Combine(WindowsAppPaths.SupportRoot, "controls.json");
        _router.SetBindings(ControlBindingStore.Load(_settingsPath));
        _monitor = new Thread(MonitorLoop)
        {
            IsBackground = true,
            Name = "RELight USB controls"
        };
        _monitor.Start();
    }

    public event EventHandler<ControlRole>? InputReceived;

    public event EventHandler? StatusChanged;

    public HidControlStatus Status
    {
        get
        {
            lock (_gate)
            {
                return new HidControlStatus(
                    Available: _sessions.Count > 0,
                    Message: _message,
                    Devices: _devices.ToArray(),
                    Bindings: _router.Bindings,
                    LearningRole: _learningRole,
                    RecordTested: _router.IsTested(ControlRole.Record),
                    ChoiceTested: _router.IsTested(ControlRole.Choice));
            }
        }
    }

    public IReadOnlyList<ControlBinding> Bindings => _router.Bindings;

    public bool IsTested(ControlRole role) => _router.IsTested(role);

    public bool IsConnected(ControlRole role)
    {
        lock (_gate)
        {
            var connected = _sessions.Keys.ToArray();
            return _router.IsConnected(role, connected);
        }
    }

    public bool HasBinding(ControlRole role) => _router.BindingFor(role) is not null;

    public void SetProductionMode(bool active)
    {
        lock (_gate)
        {
            if (_productionMode == active)
            {
                return;
            }

            _productionMode = active;
            _learning = null;
            _learningRole = null;
            _router.ClearTested();
            _message = active
                ? "Press each assigned physical control once to test it."
                : "Rehearsal mode: physical controls are observed but cannot satisfy exhibition readiness.";
        }

        RaiseStatusChanged();
    }

    public bool BeginLearning(ControlRole role)
    {
        lock (_gate)
        {
            if (_sessions.Count == 0)
            {
                _message = "No assignable USB HID device is connected.";
                RaiseStatusChanged();
                return false;
            }

            _learning = new HidLearningTracker();
            _learningRole = role;
            _message = $"Press and release the {role.ShortName()} control twice.";
        }

        RaiseStatusChanged();
        return true;
    }

    public void CancelLearning()
    {
        lock (_gate)
        {
            _learning = null;
            _learningRole = null;
            _message = "Assignment cancelled.";
        }

        RaiseStatusChanged();
    }

    public void Refresh()
    {
        ThreadPool.QueueUserWorkItem(_ => EnumerateDevices());
    }

    public void Dispose()
    {
        lock (_gate)
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
        }

        _shutdown.Cancel();
        _monitor?.Join(TimeSpan.FromSeconds(2));
        DeviceSession[] sessions;
        lock (_gate)
        {
            sessions = _sessions.Values.ToArray();
            _sessions.Clear();
            _devices.Clear();
        }

        foreach (var session in sessions)
        {
            StopSession(session);
        }

        _shutdown.Dispose();
    }

    private void MonitorLoop()
    {
        while (!_shutdown.IsCancellationRequested)
        {
            try
            {
                EnumerateDevices();
            }
            catch (Exception exception)
            {
                lock (_gate)
                {
                    _message = "USB control enumeration failed: " + exception.Message;
                }

                RaiseStatusChanged();
            }

            if (_shutdown.Token.WaitHandle.WaitOne(2000))
            {
                return;
            }
        }
    }

    private void EnumerateDevices()
    {
        lock (_enumerationGate)
        {
            EnumerateDevicesLocked();
        }
    }

    private void EnumerateDevicesLocked()
    {
        var found = new List<(HidDevice Device, string Id, string Label, string Manufacturer,
            string Quality, string Note, bool LocationBound, Dictionary<string, ElementSession> Elements,
            List<string> ElementOrder, string? Reason)>();

        IEnumerable<HidDevice> devices;
        try
        {
            devices = _deviceList.GetHidDevices().ToArray();
        }
        catch (Exception exception)
        {
            lock (_gate)
            {
                _message = "USB HID enumeration failed: " + exception.Message;
            }

            RaiseStatusChanged();
            return;
        }

        foreach (var device in devices)
        {
            try
            {
                var serial = SafeSerial(device);
                var path = SafePath(device);
                var identity = HidIdentityResolver.Resolve(
                    device.VendorID,
                    device.ProductID,
                    serial,
                    physicalUniqueId: null,
                    locationId: path,
                    registryEntryId: 0,
                    bootSessionId: _sessionId);
                var label = SafeProductName(device);
                var manufacturer = SafeManufacturer(device);
                var descriptor = device.GetReportDescriptor();
                var deviceUsage = descriptor.DeviceItems
                    .Select(item => item.Usages.GetAllValues().FirstOrDefault())
                    .FirstOrDefault(value => value != 0);
                HidIdentityResolver.TryUnpackUsage(deviceUsage, out var usagePage, out var usage);

                var elements = new Dictionary<string, ElementSession>(StringComparer.Ordinal);
                var order = new List<string>();
                var reason = deviceUsage == 0 ? "The device descriptor has no top-level usage." : null;
                if (HidElementPolicy.DeviceIsMouse(usagePage, usage))
                {
                    reason = "Pointer devices cannot be assigned.";
                }
                else if (HidElementPolicy.DeviceIsSensor(usagePage))
                {
                    reason = "Sensor devices cannot be assigned.";
                }

                if (reason is null)
                {
                    foreach (var report in descriptor.InputReports)
                    {
                        var dataItemIndex = 0;
                        foreach (var dataItem in report.DataItems)
                        {
                            var itemIndex = dataItemIndex++;
                            if (dataItem.IsConstant)
                            {
                                continue;
                            }

                            // A boot/NKRO keyboard commonly reports ordinary keys as an
                            // array of usage codes rather than one binary element per key.
                            // Materialize each key usage as a synthetic binary element so
                            // the same learning/router path works for both encoders and
                            // keyboards. Modifiers remain excluded by the shared policy.
                            if (dataItem.IsArray)
                            {
                                if (usagePage != HidElementPolicy.GenericDesktopPage ||
                                    usage is not (HidElementPolicy.KeyboardUsage or HidElementPolicy.KeypadUsage) ||
                                    dataItem.Usages.GetAllValues().FirstOrDefault() >> 16 != HidElementPolicy.KeyboardOrKeypadPage)
                                {
                                    continue;
                                }

                                foreach (var packed in dataItem.Usages.GetAllValues())
                                {
                                    if (!HidIdentityResolver.TryUnpackUsage(packed, out var elementPage, out var elementUsage) ||
                                        !HidElementPolicy.IsAssignable(
                                            usagePage,
                                            usage,
                                            elementPage,
                                            elementUsage,
                                            isInput: true,
                                            logicalMinimum: 0,
                                            logicalMaximum: 1))
                                    {
                                        continue;
                                    }

                                    var elementId = HidIdentityResolver.WindowsElementId(
                                        identity.Id,
                                        report.ReportID,
                                        itemIndex,
                                        elementUsage,
                                        elementPage,
                                        elementUsage);
                                    elements[elementId] = new ElementSession
                                    {
                                        DeviceId = identity.Id,
                                        DeviceLabel = label,
                                        ElementId = elementId,
                                        ElementLabel = HidElementPolicy.GenericElementLabel(elementPage, elementUsage),
                                        UsagePage = elementPage,
                                        Usage = elementUsage,
                                        ReportId = report.ReportID,
                                        DataItemIndex = itemIndex,
                                        ElementIndex = elementUsage,
                                        IsArray = true,
                                        LogicalMinimum = 0,
                                        LogicalMaximum = 1,
                                        IdentityQuality = identity.Quality.ToString().ToLowerInvariant(),
                                        LocationBound = identity.LocationBound
                                    };
                                    order.Add(elementId);
                                }

                                continue;
                            }

                            if (!dataItem.IsVariable ||
                                dataItem.LogicalMaximum - dataItem.LogicalMinimum != 1)
                            {
                                continue;
                            }

                            for (var elementIndex = 0; elementIndex < dataItem.ElementCount; elementIndex++)
                            {
                                foreach (var packed in dataItem.Usages.GetValuesFromIndex(elementIndex))
                                {
                                    if (!HidIdentityResolver.TryUnpackUsage(packed, out var elementPage, out var elementUsage) ||
                                        !HidElementPolicy.IsAssignable(
                                            usagePage,
                                            usage,
                                            elementPage,
                                            elementUsage,
                                            isInput: true,
                                            dataItem.LogicalMinimum,
                                            dataItem.LogicalMaximum))
                                    {
                                        continue;
                                    }

                                    var elementId = HidIdentityResolver.WindowsElementId(
                                        identity.Id,
                                        report.ReportID,
                                        itemIndex,
                                        elementIndex,
                                        elementPage,
                                        elementUsage);
                                    elements[elementId] = new ElementSession
                                    {
                                        DeviceId = identity.Id,
                                        DeviceLabel = label,
                                        ElementId = elementId,
                                        ElementLabel = HidElementPolicy.GenericElementLabel(elementPage, elementUsage),
                                        UsagePage = elementPage,
                                        Usage = elementUsage,
                                        ReportId = report.ReportID,
                                        DataItemIndex = itemIndex,
                                        ElementIndex = elementIndex,
                                        IsArray = false,
                                        LogicalMinimum = dataItem.LogicalMinimum,
                                        LogicalMaximum = dataItem.LogicalMaximum,
                                        IdentityQuality = identity.Quality.ToString().ToLowerInvariant(),
                                        LocationBound = identity.LocationBound
                                    };
                                    order.Add(elementId);
                                }
                            }
                        }
                    }
                }

                found.Add((device, identity.Id, label, manufacturer, identity.Quality.ToString().ToLowerInvariant(),
                    identity.Note, identity.LocationBound, elements, order, reason));
            }
            catch (Exception exception)
            {
                found.Add((device, "hid_unavailable_" + Math.Abs(device.DevicePath.GetHashCode()),
                    SafeProductName(device), SafeManufacturer(device), "session", "Descriptor unavailable", false,
                    new Dictionary<string, ElementSession>(), [], "Cannot read the HID report descriptor: " + exception.Message));
            }
        }

        var toStop = new List<DeviceSession>();
        var toStart = new List<DeviceSession>();
        lock (_gate)
        {
            if (_disposed)
            {
                return;
            }

            var present = new HashSet<string>(found.Select(item => item.Id), StringComparer.Ordinal);
            foreach (var existing in _sessions.Where(pair => !present.Contains(pair.Key)).ToArray())
            {
                _sessions.Remove(existing.Key);
                toStop.Add(existing.Value);
            }

            _devices.Clear();
            foreach (var item in found)
            {
                _devices.Add(new HidControlDevice(
                    item.Id,
                    item.Label,
                    item.Manufacturer,
                    item.Device.VendorID,
                    item.Device.ProductID,
                    item.Quality,
                    item.Note,
                    item.LocationBound,
                    Connected: true,
                    Assignable: item.Elements.Count > 0,
                    AssignableElementCount: item.Elements.Count,
                    item.Reason));

                if (_sessions.ContainsKey(item.Id) || item.Elements.Count == 0)
                {
                    continue;
                }

                toStart.Add(new DeviceSession
                {
                    Device = item.Device,
                    Id = item.Id,
                    Label = item.Label,
                    Manufacturer = item.Manufacturer,
                    IdentityQuality = item.Quality,
                    IdentityNote = item.Note,
                    LocationBound = item.LocationBound,
                    Elements = item.Elements,
                    ElementOrder = item.ElementOrder,
                    Reason = item.Reason
                });
            }
        }

        // Reader threads take _gate when they report an edge; never join or open
        // while holding it, or a just-unplugged device can deadlock enumeration.
        foreach (var session in toStop)
        {
            StopSession(session);
        }

        // Re-testing is required only when an assigned device disappears. An
        // unrelated HID device being unplugged must not silently disable the
        // physical controls during a live exhibition run.
        if (toStop.Count > 0 &&
            toStop.Any(session => _router.Bindings.Any(binding =>
                string.Equals(binding.DeviceId, session.Id, StringComparison.Ordinal))))
        {
            _router.ClearTested();
        }

        foreach (var session in toStart)
        {
            if (StartSession(session))
            {
                lock (_gate)
                {
                    _sessions[session.Id] = session;
                }
            }
        }

        lock (_gate)
        {
            if (_disposed)
            {
                return;
            }

            _message = _sessions.Count == 0
                ? "No readable USB HID control is connected."
                : _learning is not null
                    ? _message
                    : $"{_sessions.Count} USB HID device{(_sessions.Count == 1 ? "" : "s")} connected.";
        }

        RaiseStatusChanged();
    }

    private bool StartSession(DeviceSession session)
    {
        try
        {
            session.Stream = session.Device.Open();
            session.Stream.ReadTimeout = 1000;
            session.Descriptor = session.Device.GetReportDescriptor();
            session.Receiver = session.Descriptor.CreateHidDeviceInputReceiver();
            session.Receiver.Start(session.Stream);
            session.Cancellation = CancellationTokenSource.CreateLinkedTokenSource(_shutdown.Token);
            session.Reader = new Thread(() => ReadLoop(session))
            {
                IsBackground = true,
                Name = "RELight HID " + session.Label
            };
            session.Reader.Start();
            return true;
        }
        catch (Exception exception)
        {
            StopSession(session);
            lock (_gate)
            {
                _message = $"Could not open {session.Label}: {exception.Message}";
            }

            return false;
        }
    }

    private void ReadLoop(DeviceSession session)
    {
        var buffer = new byte[Math.Max(1, session.Descriptor?.MaxInputReportLength ?? 64)];
        while (!_shutdown.IsCancellationRequested && session.Cancellation is { IsCancellationRequested: false })
        {
            try
            {
                if (session.Receiver is null)
                {
                    return;
                }

                session.Receiver.WaitHandle.WaitOne(250);
                while (!_shutdown.IsCancellationRequested && session.Receiver.TryRead(buffer, 0, out var report))
                {
                    report.Read(buffer, 0, (data, bitOffset, dataItem, dataItemIndex) =>
                    {
                        ProcessDataItem(session, data, bitOffset, dataItem, dataItemIndex);
                    });
                }
            }
            catch (TimeoutException)
            {
                // A silent device is normal; keep watching until unplugged.
            }
            catch (Exception exception)
            {
                lock (_gate)
                {
                    _message = $"{session.Label} stopped responding: {exception.Message}";
                }

                RaiseStatusChanged();
                return;
            }
        }
    }

    private void ProcessDataItem(
        DeviceSession session,
        byte[] buffer,
        int bitOffset,
        DataItem dataItem,
        int dataItemIndex)
    {
        if (dataItem.IsConstant)
        {
            return;
        }

        var reportId = dataItem.Report?.ReportID ?? 0;
        if (dataItem.IsArray)
        {
            if (dataItem.Usages.GetAllValues().FirstOrDefault() >> 16 !=
                HidElementPolicy.KeyboardOrKeypadPage)
            {
                return;
            }

            var active = new HashSet<int>();
            for (var elementIndex = 0; elementIndex < dataItem.ElementCount; elementIndex++)
            {
                var raw = dataItem.ReadLogical(buffer, bitOffset, elementIndex);
                if (raw == 0)
                {
                    continue;
                }

                foreach (var packed in dataItem.Usages.GetValuesFromIndex(raw))
                {
                    if (HidIdentityResolver.TryUnpackUsage(packed, out var page, out var usage) &&
                        page == HidElementPolicy.KeyboardOrKeypadPage)
                    {
                        active.Add(usage);
                    }
                }
            }

            foreach (var element in session.Elements.Values)
            {
                if (!element.IsArray ||
                    element.ReportId != reportId ||
                    element.DataItemIndex != dataItemIndex)
                {
                    continue;
                }

                UpdateElement(element, active.Contains(element.Usage) ? 1 : 0);
            }

            return;
        }

        if (!dataItem.IsVariable ||
            dataItem.LogicalMaximum - dataItem.LogicalMinimum != 1)
        {
            return;
        }

        for (var elementIndex = 0; elementIndex < dataItem.ElementCount; elementIndex++)
        {
            var value = dataItem.ReadLogical(buffer, bitOffset, elementIndex);
            if (value is not (0 or 1))
            {
                continue;
            }

            foreach (var packed in dataItem.Usages.GetValuesFromIndex(elementIndex))
            {
                if (!HidIdentityResolver.TryUnpackUsage(packed, out var page, out var usage))
                {
                    continue;
                }

                var elementId = HidIdentityResolver.WindowsElementId(
                    session.Id,
                    reportId,
                    dataItemIndex,
                    elementIndex,
                    page,
                    usage);
                if (session.Elements.TryGetValue(elementId, out var element))
                {
                    UpdateElement(element, value);
                }
            }
        }
    }

    private void UpdateElement(ElementSession element, int value)
    {
        var previous = element.LastValue;
        var initialized = element.Initialized;
        element.LastValue = value;
        element.Initialized = true;
        if (initialized && value != previous)
        {
            ObserveElement(element, previous, value);
        }
    }

    private void ObserveElement(ElementSession element, int previous, int value)
    {
        HidLearningUpdate? learningUpdate = null;
        ControlRole? learningRole = null;
        lock (_gate)
        {
            if (_learning is { } learning && _learningRole is { } activeRole)
            {
                learningRole = activeRole;
                learningUpdate = learning.Observe(
                    element.DeviceId,
                    element.ElementId,
                    previous,
                    value,
                    Environment.TickCount64);
            }
        }

        if (learningUpdate is { } update && learningRole is { } role)
        {
            switch (update.Kind)
            {
                case HidLearningUpdateKind.FirstPress:
                    SetMessage($"Detected {element.DeviceLabel} · {element.ElementLabel}. Release it, then press it again.");
                    break;
                case HidLearningUpdateKind.Progress:
                    SetMessage($"Press {role.ShortName()} once more to finish assignment.");
                    break;
                case HidLearningUpdateKind.Complete:
                    CompleteLearning(role, element, update.Element!);
                    break;
            }

            return;
        }

        lock (_gate)
        {
            if (!_productionMode || _learning is not null)
            {
                return;
            }
        }

        var accepted = _router.Observe(element.DeviceId, element.ElementId, value);
        if (accepted is { } acceptedRole)
        {
            SetMessage($"{acceptedRole.DisplayName()} input received.");
            InputReceived?.Invoke(this, acceptedRole);
        }
    }

    private void CompleteLearning(ControlRole role, ElementSession element, HidLearnElement learned)
    {
        lock (_gate)
        {
            if (_learningRole != role)
            {
                return;
            }
        }

        var binding = new ControlBinding
        {
            Role = role.WireName(),
            DeviceId = element.DeviceId,
            DeviceLabel = element.DeviceLabel,
            ElementId = element.ElementId,
            ElementLabel = element.ElementLabel,
            UsagePage = element.UsagePage,
            Usage = element.Usage,
            ReportId = element.ReportId,
            LogicalMinimum = element.LogicalMinimum,
            LogicalMaximum = element.LogicalMaximum,
            ReleasedValue = learned.ReleasedValue,
            PressedValue = learned.PressedValue,
            IdentityQuality = element.IdentityQuality,
            LocationBound = element.LocationBound,
            AssignedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        try
        {
            var bindings = _router.Bindings
                .Where(item => item.ParsedRole != role)
                .Append(binding)
                .ToArray();
            ControlBindingStore.Save(_settingsPath, bindings);
            _router.SetBindings(bindings);
            _router.ClearTested();
            lock (_gate)
            {
                _learning = null;
                _learningRole = null;
                _message = $"{role.DisplayName()} assigned. Press it once to test.";
            }
        }
        catch (Exception exception)
        {
            lock (_gate)
            {
                _message = "The control assignment could not be saved: " + exception.Message;
            }
        }

        RaiseStatusChanged();
    }

    private void SetMessage(string message)
    {
        lock (_gate)
        {
            _message = message;
        }

        RaiseStatusChanged();
    }

    private void RaiseStatusChanged() => StatusChanged?.Invoke(this, EventArgs.Empty);

    private void StopSession(DeviceSession session)
    {
        try
        {
            session.Cancellation?.Cancel();
            session.Reader?.Join(TimeSpan.FromMilliseconds(500));
        }
        catch (Exception)
        {
            // The reader is background and may already be gone.
        }

        try
        {
            session.Stream?.Dispose();
        }
        catch (Exception)
        {
            // Device removal can make disposal throw.
        }

        session.Cancellation?.Dispose();
        session.Cancellation = null;
        session.Stream = null;
        session.Receiver = null;
        session.Descriptor = null;
        session.Reader = null;
    }

    private static string SafeSerial(HidDevice device)
    {
        try
        {
            return device.GetSerialNumber() ?? "";
        }
        catch (Exception)
        {
            return "";
        }
    }

    private static string SafePath(HidDevice device)
    {
        try
        {
            return device.DevicePath ?? "";
        }
        catch (Exception)
        {
            return "";
        }
    }

    private static string SafeProductName(HidDevice device)
    {
        try
        {
            var name = device.GetProductName();
            return string.IsNullOrWhiteSpace(name) ? HidIdentityResolver.GenericLabel(device.VendorID, device.ProductID) : name.Trim();
        }
        catch (Exception)
        {
            return HidIdentityResolver.GenericLabel(device.VendorID, device.ProductID);
        }
    }

    private static string SafeManufacturer(HidDevice device)
    {
        try
        {
            return device.GetManufacturer()?.Trim() ?? "";
        }
        catch (Exception)
        {
            return "";
        }
    }
}
