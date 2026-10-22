using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;

namespace RELight.Controls;

public enum HidIdentityQuality
{
    Serial,
    Physical,
    Port,
    Session
}

public sealed record HidIdentity(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("quality")] HidIdentityQuality Quality,
    [property: JsonPropertyName("note")] string Note,
    [property: JsonPropertyName("locationBound")] bool LocationBound);

/// <summary>
/// Stable, non-reversible HID identity. The Mac helper hashes serial or port
/// material before it leaves its process; Windows follows the same rule. Raw
/// serial numbers and device paths are never persisted in project files.
/// </summary>
public static class HidIdentityResolver
{
    private const string Namespace = "com.relight.engine.hid.v1";

    public static HidIdentity Resolve(
        int vendorId,
        int productId,
        string? serial,
        string? physicalUniqueId,
        string? locationId,
        ulong registryEntryId,
        string bootSessionId)
    {
        var prefix = $"{vendorId}:{productId}:";
        if (Meaningful(serial) is { } serialValue)
        {
            return Create(prefix + "serial:" + serialValue, HidIdentityQuality.Serial,
                "Stable device identity", locationBound: false);
        }

        if (Meaningful(physicalUniqueId) is { } physicalValue)
        {
            return Create(prefix + "physical:" + physicalValue, HidIdentityQuality.Physical,
                "Stable physical identity", locationBound: false);
        }

        if (Meaningful(locationId) is { } locationValue)
        {
            return Create(prefix + "port:" + locationValue, HidIdentityQuality.Port,
                "Bound to this USB port", locationBound: true);
        }

        return Create(
            prefix + "session:" + bootSessionId + ":" + registryEntryId,
            HidIdentityQuality.Session,
            "Available for this startup only",
            locationBound: false);
    }

    public static string ElementId(
        string deviceId,
        uint cookie,
        int usagePage,
        int usage,
        int reportId,
        int collectionUsagePage = 0,
        int collectionUsage = 0) =>
        "element_" + Digest(
            $"{deviceId}:{collectionUsagePage}:{collectionUsage}:{cookie}:{usagePage}:{usage}:{reportId}");

    /// <summary>
    /// Windows raw-input and HidSharp paths do not expose the IOHID cookie. The
    /// report/data-item/element position is stable for the installed descriptor
    /// and is hashed with the same namespace.
    /// </summary>
    public static string WindowsElementId(
        string deviceId,
        int reportId,
        int dataItemIndex,
        int elementIndex,
        int usagePage,
        int usage,
        int collectionUsagePage = 0,
        int collectionUsage = 0) =>
        "element_" + Digest(
            $"{deviceId}:win:{collectionUsagePage}:{collectionUsage}:{reportId}:{dataItemIndex}:{elementIndex}:{usagePage}:{usage}");

    public static string GenericLabel(int vendorId, int productId) =>
        $"USB input {vendorId & 0xFFFF:X4}:{productId & 0xFFFF:X4}";

    public static string PackageUsage(int usagePage, int usage) =>
        $"0x{usagePage:X4}:0x{usage:X4}";

    public static bool TryUnpackUsage(uint packed, out int usagePage, out int usage)
    {
        usagePage = (int)((packed >> 16) & 0xFFFF);
        usage = (int)(packed & 0xFFFF);
        return usagePage != 0 || usage != 0;
    }

    private static HidIdentity Create(
        string material,
        HidIdentityQuality quality,
        string note,
        bool locationBound) =>
        new("hid_" + Digest(material), quality, note, locationBound);

    private static string Digest(string material)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(Namespace + "\0" + material));
        return Convert.ToHexString(bytes.AsSpan(0, 16)).ToLowerInvariant();
    }

    private static string? Meaningful(string? value)
    {
        if (value is null)
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length == 0 ? null : trimmed;
    }
}
