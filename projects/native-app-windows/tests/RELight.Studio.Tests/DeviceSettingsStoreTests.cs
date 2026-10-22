namespace RELight.Studio.Tests;

public sealed class DeviceSettingsStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(
        Path.GetTempPath(),
        "relight-settings-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_root))
            {
                Directory.Delete(_root, recursive: true);
            }
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    [Fact]
    public void MissingFileLoadsEmptySettings()
    {
        var store = new DeviceSettingsStore(_root);

        Assert.Equal(DeviceSettings.Empty, store.Load());
        Assert.False(File.Exists(store.FilePath));
    }

    [Fact]
    public void SaveAndLoadRoundTripOutsideTheProjectFolder()
    {
        var store = new DeviceSettingsStore(_root);
        var settings = new DeviceSettings(
            @"\\?\SWD#MMDEVAPI#{mic-guid}",
            @"\\?\SWD#MMDEVAPI#{speaker-guid}",
            @"\\?\DISPLAY#DELA1B2#5&2b7c1d4f&0&UID4352#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}");

        store.Save(settings);

        Assert.Equal(settings, store.Load());
        Assert.Equal(Path.Combine(_root, "devices.json"), store.FilePath);
        Assert.Contains("\"inputUid\"", File.ReadAllText(store.FilePath));
    }

    [Fact]
    public void LaterSavesReplaceEarlierAssignments()
    {
        var store = new DeviceSettingsStore(_root);
        store.Save(new DeviceSettings("mic-1", "out-1", "screen-1"));
        store.Save(new DeviceSettings("mic-2", "out-2", "screen-2"));

        Assert.Equal(new DeviceSettings("mic-2", "out-2", "screen-2"), store.Load());
        Assert.Single(Directory.GetFiles(_root, "devices.json"));
        Assert.Empty(Directory.GetFiles(_root, "*.tmp"));
    }

    [Fact]
    public void MalformedOrIncompleteJsonFailsClosedToEmptySettings()
    {
        var store = new DeviceSettingsStore(_root);
        Directory.CreateDirectory(_root);

        File.WriteAllText(store.FilePath, "{ not json");
        Assert.Equal(DeviceSettings.Empty, store.Load());

        File.WriteAllText(store.FilePath, "{}");
        Assert.Equal(DeviceSettings.Empty, store.Load());

        File.WriteAllText(store.FilePath, """{"inputUid":"mic","outputUid":null,"screenId":"screen"}""");
        Assert.Equal(DeviceSettings.Empty, store.Load());
    }
}
