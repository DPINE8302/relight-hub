using System.Runtime.InteropServices;
using RELight.Core;

namespace RELight.Windows;

public readonly record struct PowerSnapshot(PowerSource Source, bool Known)
{
    public bool CanRunExhibition => Known && Source == PowerSource.AlternatingCurrent;
}

/// <summary>
/// Reads the Windows AC/battery state. Unknown is treated as unsafe, matching
/// the fail-closed exhibition policy.
/// </summary>
public static class WindowsPower
{
    private const byte Unknown = 255;
    private const byte OnBattery = 0;
    private const byte OnAlternatingCurrent = 1;

    [StructLayout(LayoutKind.Sequential)]
    private struct SystemPowerStatus
    {
        public byte AcLineStatus;
        public byte BatteryFlag;
        public byte BatteryLifePercent;
        public byte SystemStatusFlag;
        public uint BatteryLifeTime;
        public uint BatteryFullLifeTime;
    }

    [DllImport("kernel32.dll", SetLastError = false)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetSystemPowerStatus(out SystemPowerStatus status);

    [Flags]
    private enum ExecutionState : uint
    {
        SystemRequired = 0x00000001,
        DisplayRequired = 0x00000002,
        Continuous = 0x80000000
    }

    [DllImport("kernel32.dll", SetLastError = false)]
    private static extern uint SetThreadExecutionState(ExecutionState state);

    /// <summary>
    /// Keeps the display and system awake while a run or audition is active.
    /// Called on the UI thread; passing false releases the continuous request.
    /// </summary>
    public static bool SetRunAwake(bool active)
    {
        var state = ExecutionState.Continuous;
        if (active)
        {
            state |= ExecutionState.DisplayRequired | ExecutionState.SystemRequired;
        }

        return SetThreadExecutionState(state) != 0;
    }

    public static PowerSnapshot Read()
    {
        if (!GetSystemPowerStatus(out var status))
        {
            return new PowerSnapshot(PowerSource.Unknown, false);
        }

        return status.AcLineStatus switch
        {
            OnAlternatingCurrent => new PowerSnapshot(PowerSource.AlternatingCurrent, true),
            OnBattery => new PowerSnapshot(PowerSource.Battery, true),
            Unknown => new PowerSnapshot(PowerSource.Unknown, false),
            _ => new PowerSnapshot(PowerSource.Unknown, false)
        };
    }

    public static void AddExhibitionBlocker(List<string> issues)
    {
        ArgumentNullException.ThrowIfNull(issues);
        var power = Read();
        if (!power.Known)
        {
            issues.Add("Windows could not report the power source. Connect AC power and restart.");
        }
        else if (!power.CanRunExhibition)
        {
            issues.Add("Connect the PC to AC power");
        }
    }
}
