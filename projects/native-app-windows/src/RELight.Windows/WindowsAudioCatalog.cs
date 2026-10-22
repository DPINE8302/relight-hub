using NAudio.CoreAudioApi;

namespace RELight.Windows;

public sealed record AudioEndpointInfo(string Id, string Name, bool IsInput);

/// <summary>
/// Enumerates active Windows audio endpoints. The app never substitutes a
/// different endpoint silently; callers must persist and validate the selected
/// IDs before a run.
/// </summary>
public static class WindowsAudioCatalog
{
    public static IReadOnlyList<AudioEndpointInfo> GetInputs() => Get(DataFlow.Capture, isInput: true);

    public static IReadOnlyList<AudioEndpointInfo> GetOutputs() => Get(DataFlow.Render, isInput: false);

    private static IReadOnlyList<AudioEndpointInfo> Get(DataFlow flow, bool isInput)
    {
        using var enumerator = new MMDeviceEnumerator();
        var devices = new List<AudioEndpointInfo>();
        foreach (var device in enumerator.EnumerateAudioEndPoints(flow, DeviceState.Active))
        {
            using (device)
            {
                devices.Add(new AudioEndpointInfo(device.ID, device.FriendlyName, isInput));
            }
        }

        return devices;
    }
}
