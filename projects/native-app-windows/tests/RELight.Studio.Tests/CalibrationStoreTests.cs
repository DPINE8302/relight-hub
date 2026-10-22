namespace RELight.Studio.Tests;

public sealed class CalibrationStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(
        Path.GetTempPath(),
        "relight-calibration-" + Guid.NewGuid().ToString("N"));

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
    public void MissingFileLoadsZeroAdvance()
    {
        var store = new CalibrationStore(_root);

        Assert.Equal(MachineCalibration.Empty, store.Load());
        Assert.Equal(Path.Combine(_root, "calibration.json"), store.FilePath);
    }

    [Fact]
    public void SaveAndLoadKeepTheMachineAdvanceOutsideTheProject()
    {
        var store = new CalibrationStore(_root);
        store.Save(new MachineCalibration(125.5));

        Assert.Equal(125.5, store.Load().VoiceAdvanceMs);
        Assert.Contains("\"voiceAdvanceMs\"", File.ReadAllText(store.FilePath));
        Assert.Empty(Directory.GetFiles(_root, "*.tmp"));
    }

    [Fact]
    public void MalformedAndOutOfRangeFilesFailClosed()
    {
        var store = new CalibrationStore(_root);
        Directory.CreateDirectory(_root);

        File.WriteAllText(store.FilePath, "{ not json");
        Assert.Equal(MachineCalibration.Empty, store.Load());

        File.WriteAllText(store.FilePath, "{}");
        Assert.Equal(MachineCalibration.Empty, store.Load());

        File.WriteAllText(store.FilePath, """{"voiceAdvanceMs":5000}""");
        Assert.Equal(MachineCalibration.Empty, store.Load());
    }

    [Fact]
    public void InvalidCalibrationCannotBeSaved()
    {
        var store = new CalibrationStore(_root);

        Assert.Throws<ArgumentOutOfRangeException>(() => store.Save(new MachineCalibration(double.NaN)));
        Assert.Throws<ArgumentOutOfRangeException>(() => store.Save(new MachineCalibration(1_001)));
    }
}
