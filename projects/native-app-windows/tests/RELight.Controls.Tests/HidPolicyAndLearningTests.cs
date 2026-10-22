namespace RELight.Controls.Tests;

public sealed class HidPolicyAndLearningTests
{
    [Fact]
    public void AllowsBinaryButtonsAndKeysButNotModifiersAxesMiceOrSensors()
    {
        Assert.True(HidElementPolicy.IsAssignable(1, 6, 7, 4, true, 0, 1));
        Assert.True(HidElementPolicy.IsAssignable(1, 0, 9, 1, true, 1, 2));
        Assert.False(HidElementPolicy.IsAssignable(1, 6, 7, 0xE1, true, 0, 1));
        Assert.False(HidElementPolicy.IsAssignable(1, 6, 1, 0x30, true, -127, 127));
        Assert.False(HidElementPolicy.IsAssignable(1, 2, 9, 1, true, 0, 1));
        Assert.False(HidElementPolicy.IsAssignable(0x20, 1, 9, 1, true, 0, 1));
        Assert.False(HidElementPolicy.IsAssignable(1, 6, 7, 4, false, 0, 1));
    }

    [Fact]
    public void LearningRequiresTwoCompleteCyclesAndHandlesActiveLow()
    {
        var tracker = new HidLearningTracker(minimumTransitionIntervalMs: 20);
        var first = tracker.Observe("hid_a", "element_a", 1, 0, 100);
        Assert.Equal(HidLearningUpdateKind.FirstPress, first.Kind);
        Assert.Equal(1, first.Element!.ReleasedValue);
        Assert.Equal(0, first.Element.PressedValue);

        var release = tracker.Observe("hid_a", "element_a", 0, 1, 150);
        Assert.Equal(HidLearningUpdateKind.Progress, release.Kind);
        Assert.Equal(1, release.CompletedPresses);

        _ = tracker.Observe("hid_a", "element_a", 1, 0, 200);
        var complete = tracker.Observe("hid_a", "element_a", 0, 1, 250);
        Assert.Equal(HidLearningUpdateKind.Complete, complete.Kind);
        Assert.Equal(2, complete.CompletedPresses);
    }

    [Fact]
    public void LearningIgnoresHeldValuesOtherElementsAndBounce()
    {
        var tracker = new HidLearningTracker(minimumTransitionIntervalMs: 40);
        Assert.Equal(
            HidLearningUpdateKind.Ignored,
            tracker.Observe("hid_a", "element_a", 0, 0, 100).Kind);

        _ = tracker.Observe("hid_a", "element_a", 0, 1, 120);
        Assert.Equal(
            HidLearningUpdateKind.Ignored,
            tracker.Observe("hid_a", "element_a", 1, 0, 130).Kind);
        Assert.Equal(
            HidLearningUpdateKind.Ignored,
            tracker.Observe("hid_b", "element_b", 0, 1, 200).Kind);
    }
}
