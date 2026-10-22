namespace RELight.Media.Tests;

public sealed class MediaProbeTests
{
    [Fact]
    public void ProbesTheDraftQuickTimeMovie()
    {
        if (!File.Exists(TestPaths.DraftMedia))
        {
            return;
        }

        var info = IsoBmffProbe.Probe(TestPaths.DraftMedia);

        Assert.Equal("qt  ", info.MajorBrand);
        Assert.Contains("qt  ", info.CompatibleBrands);
        Assert.False(info.Fragmented);
        Assert.InRange(info.DurationSeconds, 86.5, 86.7);

        Assert.NotNull(info.Video);
        var video = info.Video!;
        Assert.Equal("avc1", video.Codec);
        Assert.Equal(1920, video.Width);
        Assert.Equal(1080, video.Height);
        Assert.Equal(2077, video.SampleCount);
        Assert.Equal(24.0, video.FrameRate, 6);
        Assert.Equal(12288, video.Timescale);
        Assert.False(video.VariableFrameRate);
        Assert.True(video.KeyframeCount > 0);
        Assert.Equal(86.541667, video.DurationSeconds, 5);

        Assert.NotNull(info.Audio);
        var audio = info.Audio!;
        Assert.Equal("mp4a", audio.Codec);
        Assert.Equal(48000, audio.SampleRate);
        Assert.Equal(2, audio.Channels);
        Assert.Equal(4060, audio.SampleCount);
    }

    [Fact]
    public void ProbesAGenericMp4Container()
    {
        if (!File.Exists(TestPaths.Scene01))
        {
            return;
        }

        var info = IsoBmffProbe.Probe(TestPaths.Scene01);
        Assert.NotNull(info.Video);
        Assert.True(info.Video!.FrameRate > 0);
        Assert.True(info.Video.SampleCount > 0);
        Assert.True(info.DurationSeconds > 0);
    }

    [Fact]
    public void RejectsAFileWithoutAMoovAtom()
    {
        var path = Path.Combine(Path.GetTempPath(), $"relight-bad-{Guid.NewGuid():N}.mov");
        try
        {
            File.WriteAllBytes(path, "not a movie"u8.ToArray());
            Assert.Throws<InvalidDataException>(() => IsoBmffProbe.Probe(path));
        }
        finally
        {
            File.Delete(path);
        }
    }
}
