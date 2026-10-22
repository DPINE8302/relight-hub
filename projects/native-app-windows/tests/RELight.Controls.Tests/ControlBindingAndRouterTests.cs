namespace RELight.Controls.Tests;

public sealed class ControlBindingAndRouterTests
{
    [Fact]
    public void BindingsRoundTripAndRejectDuplicateRoles()
    {
        var path = Path.Combine(Path.GetTempPath(), "relight-controls-" + Guid.NewGuid().ToString("N"), "controls.json");
        var bindings = new[]
        {
            Binding(ControlRole.Record, "device_a", "element_a", 0, 1),
            Binding(ControlRole.Choice, "device_b", "element_b", 0, 1)
        };

        ControlBindingStore.Save(path, bindings);
        var loaded = ControlBindingStore.Load(path);
        Assert.Equal(2, loaded.Count);
        Assert.Contains(loaded, item => item.ParsedRole == ControlRole.Record);
        Assert.Contains(loaded, item => item.ParsedRole == ControlRole.Choice);

        Assert.Throws<ArgumentException>(() => ControlBindingStore.Save(path, new[]
        {
            Binding(ControlRole.Record, "device_a", "element_a", 1, 0),
            Binding(ControlRole.Record, "device_b", "element_b", 1, 0)
        }));

        File.Delete(path);
        Directory.Delete(Path.GetDirectoryName(path)!);
    }

    [Fact]
    public void RouterRequiresAssignedElementPressEdgeAndDebounce()
    {
        long now = 1_000;
        var router = new ControlEdgeRouter(() => now);
        router.SetBindings(new[]
        {
            Binding(ControlRole.Record, "device_a", "element_a", 0, 1)
        });

        Assert.Null(router.Observe("device_a", "element_a", 0));
        Assert.Equal(ControlRole.Record, router.Observe("device_a", "element_a", 1));
        Assert.True(router.IsTested(ControlRole.Record));

        // Held reports do not repeat an action.
        Assert.Null(router.Observe("device_a", "element_a", 1));

        // Release then immediate bounce is inside the 250 ms debounce.
        Assert.Null(router.Observe("device_a", "element_a", 0));
        now += 100;
        Assert.Null(router.Observe("device_a", "element_a", 1));

        now += 200;
        Assert.Null(router.Observe("device_a", "element_a", 0));
        Assert.Equal(ControlRole.Record, router.Observe("device_a", "element_a", 1));

        // Another device cannot claim the binding.
        Assert.Null(router.Observe("device_b", "element_a", 1));
    }

    [Fact]
    public void ActiveLowBindingUsesPressedValueAndReleasesCorrectly()
    {
        var router = new ControlEdgeRouter(() => 1_000);
        router.SetBindings(new[]
        {
            Binding(ControlRole.Choice, "device_a", "element_a", 1, 0)
        });

        Assert.Null(router.Observe("device_a", "element_a", 1));
        Assert.Equal(ControlRole.Choice, router.Observe("device_a", "element_a", 0));
        Assert.Null(router.Observe("device_a", "element_a", 0));
        Assert.Null(router.Observe("device_a", "element_a", 1));
    }

    [Fact]
    public void ClearingTestsRequiresAFreshPress()
    {
        long now = 1_000;
        var router = new ControlEdgeRouter(() => now);
        router.SetBindings(new[]
        {
            Binding(ControlRole.Record, "device_a", "element_a", 0, 1)
        });

        now += 300;
        router.Observe("device_a", "element_a", 0);
        router.Observe("device_a", "element_a", 1);
        Assert.True(router.IsTested(ControlRole.Record));
        router.ClearTested();
        Assert.False(router.IsTested(ControlRole.Record));

        now += 300;
        router.Observe("device_a", "element_a", 0);
        router.Observe("device_a", "element_a", 1);
        Assert.True(router.IsTested(ControlRole.Record));
    }

    [Fact]
    public void ActionPolicyMatchesTheMacHandler()
    {
        Assert.Equal(
            ControlAction.RecordAtGate,
            ControlActionPolicy.Resolve(ControlRole.Record, atGate: true, recording: false, recordingSeconds: 0));
        Assert.Equal(
            ControlAction.FinishRecording,
            ControlActionPolicy.Resolve(ControlRole.Record, atGate: false, recording: true, recordingSeconds: 0.25));
        Assert.Equal(
            ControlAction.None,
            ControlActionPolicy.Resolve(ControlRole.Record, atGate: false, recording: true, recordingSeconds: 0.1));
        Assert.Equal(
            ControlAction.DeclineAtGate,
            ControlActionPolicy.Resolve(ControlRole.Choice, atGate: true, recording: false, recordingSeconds: 0));
        Assert.Equal(
            ControlAction.None,
            ControlActionPolicy.Resolve(ControlRole.Choice, atGate: false, recording: true, recordingSeconds: 5));
    }

    private static ControlBinding Binding(ControlRole role, string device, string element, int released, int pressed) =>
        new()
        {
            Role = role.WireName(),
            DeviceId = device,
            DeviceLabel = "USB fixture",
            ElementId = element,
            ElementLabel = "Button 1",
            UsagePage = 9,
            Usage = 1,
            ReportId = 0,
            LogicalMinimum = Math.Min(released, pressed),
            LogicalMaximum = Math.Max(released, pressed),
            ReleasedValue = released,
            PressedValue = pressed,
            IdentityQuality = "port",
            LocationBound = true,
            AssignedAt = 1
        };
}
