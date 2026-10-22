namespace RELight.Audio.Tests;

public sealed class CaptureStoreTests
{
    [Fact]
    public void CapturesABoundedTakeAndReportsMeter()
    {
        using var store = new CaptureStore();
        store.Begin(seconds: 1, sampleRate: 32_000);

        var samples = new float[32_000];
        for (var index = 0; index < samples.Length; index++)
        {
            samples[index] = (float)(Math.Sin(index * Math.PI * 2 * 440 / 32_000) * 0.1);
        }

        store.Consume(samples);

        Assert.True(store.IsRecording is false);
        Assert.True(store.Finished);
        Assert.InRange(store.Meter.Rms, 0.05f, 0.1f);
        Assert.InRange(store.Meter.Peak, 0.09f, 0.11f);

        var take = store.Finish();
        Assert.Equal(32_000, take.Samples.Length);
        Assert.Equal(32_000, take.SampleRate);
        Assert.Equal(1.0, take.DurationSeconds, 3);
        Assert.False(store.IsRecording);
    }

    [Fact]
    public void ConsumesInterleavedStereoAsMono()
    {
        using var store = new CaptureStore();
        store.Begin(seconds: 1, sampleRate: 48_000);

        var interleaved = new float[48_000 * 2];
        for (var frame = 0; frame < 48_000; frame++)
        {
            interleaved[frame * 2] = 0.2f;
            interleaved[frame * 2 + 1] = 0.6f;
        }

        store.Consume(interleaved, channels: 2);
        var take = store.Finish();
        Assert.Equal(48_000, take.Samples.Length);
        Assert.All(take.Samples, sample => Assert.Equal(0.4f, sample, 6));
    }

    [Fact]
    public void SilenceIsNotAUsableRecording()
    {
        using var store = new CaptureStore();
        store.Begin(seconds: 1, sampleRate: 48_000);
        store.Consume(new float[48_000]);

        var take = store.Finish();
        Assert.False(VoiceTakeValidator.TryCreate(take.Samples, take.SampleRate, out var validated, out var error));
        Assert.Null(validated);
        Assert.Contains("silent", error);
    }

    [Fact]
    public void EmptyTakeIsNotAUsableRecording()
    {
        Assert.False(VoiceTakeValidator.TryCreate([], 48_000, out var take, out var error));
        Assert.Null(take);
        Assert.Contains("No recording", error);
    }

    [Fact]
    public void ManualLimitIsEnforcedBeforeAllocating()
    {
        using var store = new CaptureStore();
        Assert.Throws<ArgumentOutOfRangeException>(() => store.Begin(601, 48_000));
        Assert.Throws<ArgumentOutOfRangeException>(() => store.Begin(0, 48_000));
    }

    [Fact]
    public void ClearReleasesTheTakeAndMeter()
    {
        using var store = new CaptureStore();
        store.Begin(seconds: 1, sampleRate: 48_000);
        store.Consume(Enumerable.Repeat(0.1f, 48_000).ToArray());
        Assert.True(store.Finished);

        store.Clear();
        Assert.False(store.IsRecording);
        Assert.False(store.Finished);
        Assert.Equal((0f, 0f), store.Meter);
        Assert.Empty(store.Finish().Samples);
    }
}
