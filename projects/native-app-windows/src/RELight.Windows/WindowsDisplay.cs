using System.Runtime.InteropServices;

namespace RELight.Windows;

public readonly record struct DisplayBounds(int Left, int Top, int Right, int Bottom)
{
    public int Width => Right - Left;

    public int Height => Bottom - Top;
}

public sealed record DisplayInfo(
    string DeviceName,
    string DeviceId,
    string Description,
    DisplayBounds Bounds,
    bool IsPrimary);

/// <summary>
/// Monitor enumeration for display selection. Identity uses the monitor device
/// interface path when available, falling back to the GDI display name.
/// </summary>
public static class WindowsDisplayCatalog
{
    private const uint MonitorInfoPrimary = 0x00000001;
    private const uint EddGetDeviceInterfaceName = 0x00000001;

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct MonitorInfoEx
    {
        public int Size;
        public Rect Monitor;
        public Rect Work;
        public uint Flags;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string DeviceName;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DisplayDevice
    {
        public int Cb;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string DeviceName;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceString;

        public uint StateFlags;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceId;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceKey;
    }

    private delegate bool MonitorEnumProc(IntPtr monitor, IntPtr dc, ref Rect rect, IntPtr data);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumDisplayMonitors(
        IntPtr dc,
        IntPtr clip,
        MonitorEnumProc callback,
        IntPtr data);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfoEx info);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumDisplayDevices(
        string? device,
        uint deviceNumber,
        ref DisplayDevice displayDevice,
        uint flags);

    public static IReadOnlyList<DisplayInfo> GetDisplays()
    {
        var displays = new List<DisplayInfo>();
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr monitor, IntPtr _, ref Rect _, IntPtr _) =>
        {
            var info = new MonitorInfoEx
            {
                Size = Marshal.SizeOf<MonitorInfoEx>(),
                DeviceName = ""
            };
            if (!GetMonitorInfo(monitor, ref info))
            {
                return true;
            }

            var deviceName = info.DeviceName;
            var monitorDevice = new DisplayDevice
            {
                Cb = Marshal.SizeOf<DisplayDevice>(),
                DeviceName = "",
                DeviceString = "",
                DeviceId = "",
                DeviceKey = ""
            };

            var id = deviceName;
            var description = deviceName;
            if (EnumDisplayDevices(deviceName, 0, ref monitorDevice, EddGetDeviceInterfaceName))
            {
                if (!string.IsNullOrWhiteSpace(monitorDevice.DeviceId))
                {
                    id = monitorDevice.DeviceId;
                }

                if (!string.IsNullOrWhiteSpace(monitorDevice.DeviceString))
                {
                    description = monitorDevice.DeviceString;
                }
            }

            displays.Add(new DisplayInfo(
                deviceName,
                id,
                description,
                new DisplayBounds(info.Monitor.Left, info.Monitor.Top, info.Monitor.Right, info.Monitor.Bottom),
                (info.Flags & MonitorInfoPrimary) != 0));
            return true;
        }, IntPtr.Zero);

        return displays;
    }
}
