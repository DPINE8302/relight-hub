namespace RELight.Controls.Tests;

public sealed class HidIdentityTests
{
    [Fact]
    public void StrongestIdentityWinsWithoutLeakingSerial()
    {
        var identity = HidIdentityResolver.Resolve(
            vendorId: 123,
            productId: 456,
            serial: "PRIVATE-SERIAL",
            physicalUniqueId: "private-physical",
            locationId: "private-port",
            registryEntryId: 99,
            bootSessionId: "private-boot");

        Assert.Equal(HidIdentityQuality.Serial, identity.Quality);
        Assert.StartsWith("hid_", identity.Id);
        Assert.DoesNotContain("PRIVATE", identity.Id, StringComparison.Ordinal);
        Assert.False(identity.LocationBound);
    }

    [Fact]
    public void FallsBackToPortThenSession()
    {
        var port = HidIdentityResolver.Resolve(
            1, 2, null, null, "0x123", 3, "boot");
        Assert.Equal(HidIdentityQuality.Port, port.Quality);
        Assert.True(port.LocationBound);
        Assert.Equal("Bound to this USB port", port.Note);

        var session = HidIdentityResolver.Resolve(
            1, 2, null, null, null, 3, "boot");
        Assert.Equal(HidIdentityQuality.Session, session.Quality);
        Assert.False(session.LocationBound);
    }

    [Fact]
    public void CompositeCollectionsShareADeviceButKeepDistinctElements()
    {
        var first = HidIdentityResolver.Resolve(
            1, 2, "shared-device", null, "port", 10, "boot");
        var second = HidIdentityResolver.Resolve(
            1, 2, "shared-device", null, "port", 11, "boot");
        Assert.Equal(first.Id, second.Id);

        var keyboard = HidIdentityResolver.ElementId(
            first.Id, 1, 7, 4, 0, 1, 6);
        var keypad = HidIdentityResolver.ElementId(
            first.Id, 1, 7, 4, 0, 1, 7);
        Assert.NotEqual(keyboard, keypad);
    }

    [Fact]
    public void PackedUsagesRoundTrip()
    {
        Assert.True(HidIdentityResolver.TryUnpackUsage(0x000700E1, out var page, out var usage));
        Assert.Equal(7, page);
        Assert.Equal(0xE1, usage);
    }
}
