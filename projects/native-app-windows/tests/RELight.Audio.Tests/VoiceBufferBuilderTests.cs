using RELight.Core;

namespace RELight.Audio.Tests;

public sealed class VoiceBufferBuilderTests
{
    [Fact]
    public void AppliesFadesAndResumesWithoutRestartingThem()
    {
        var take = ConstantTake(seconds: 2, value: 0.1f);
        var cue = new VoiceCue(0, 24)
        {
            SourceInFrame = 6,
            FadeInFrames = 12,
            FadeOutFrames = 12
        };
        var rate = new FrameRate(24);

        var original = VoiceBufferBuilder.Build(take, cue, rate);
        Assert.Equal(48_000, original.Length);
        Assert.Equal(0.025f, original[6_000], 5);

        var resumed = VoiceBufferBuilder.Build(take, cue, rate, offsetFrames: 3);
        Assert.Equal(42_000, resumed.Length);
        Assert.Equal(0.025f, resumed[0], 5);
        for (var index = 0; index < resumed.Length; index++)
        {
            Assert.Equal(original[6_000 + index], resumed[index]);
        }

        Assert.Throws<AudioException>(() => VoiceBufferBuilder.Build(take, cue, rate, offsetFrames: 24));
    }

    [Fact]
    public void RepeatsAndLoopsWithSpliceRamps()
    {
        var take = RampTake();
        var cue = new VoiceCue(0, 240)
        {
            FadeInFrames = 0,
            FadeOutFrames = 0
        };
        var rate = new FrameRate(24);

        Assert.Equal(144_000, VoiceBufferBuilder.Build(take, cue, rate).Length);

        cue.RepeatCount = 3;
        Assert.Equal(432_000, VoiceBufferBuilder.Build(take, cue, rate).Length);

        cue.LoopToFill = true;
        var full = VoiceBufferBuilder.Build(take, cue, rate);
        Assert.Equal(480_000, full.Length);
        Assert.Equal(full[1_000], full[145_000]);

        var resumed = VoiceBufferBuilder.Build(take, cue, rate, offsetFrames: 96);
        Assert.Equal(288_000, resumed.Length);
        for (var index = 0; index < resumed.Length; index++)
        {
            Assert.Equal(full[192_000 + index], resumed[index]);
        }
    }

    [Fact]
    public void AShortSourceCanFillOnlyItsOwnLengthUnlessRepeated()
    {
        var take = ConstantTake(seconds: 1, value: 0.1f);
        var cue = new VoiceCue(0, 240)
        {
            FadeInFrames = 0,
            FadeOutFrames = 0
        };

        Assert.Equal(48_000, VoiceBufferBuilder.Build(take, cue, new FrameRate(24)).Length);

        cue.RepeatCount = 3;
        Assert.Equal(144_000, VoiceBufferBuilder.Build(take, cue, new FrameRate(24)).Length);
    }

    [Fact]
    public void RejectsRegionsBeyondTheManualMemoryLimit()
    {
        var take = ConstantTake(seconds: 3, value: 0.1f);
        var cue = new VoiceCue(0, 24 * 601)
        {
            LoopToFill = true,
            FadeInFrames = 0,
            FadeOutFrames = 0
        };

        var error = Assert.Throws<AudioException>(() => VoiceBufferBuilder.Build(take, cue, new FrameRate(24)));
        Assert.Contains("10-minute", error.Message);
    }

    [Fact]
    public void RejectsWrongSampleRateEmptyTakeAndBadTrim()
    {
        var cue = new VoiceCue(0, 24);
        Assert.Throws<AudioException>(() =>
            VoiceBufferBuilder.Build(new VoiceTake(new float[48_000], 44_100), cue, new FrameRate(24)));
        Assert.Throws<AudioException>(() =>
            VoiceBufferBuilder.Build(new VoiceTake([], 48_000), cue, new FrameRate(24)));

        var take = ConstantTake(seconds: 2, value: 0.1f);
        var trimmed = new VoiceCue(0, 24) { SourceInFrame = 72 };
        Assert.Throws<AudioException>(() => VoiceBufferBuilder.Build(take, trimmed, new FrameRate(24)));
    }

    private static VoiceTake ConstantTake(double seconds, float value) =>
        new(Enumerable.Repeat(value, (int)(seconds * VoiceBufferBuilder.SampleRate)).ToArray(), VoiceBufferBuilder.SampleRate);

    private static VoiceTake RampTake()
    {
        var samples = new float[144_000];
        for (var index = 0; index < samples.Length; index++)
        {
            samples[index] = 0.01f + index / 144_000f * 0.05f;
        }

        return new VoiceTake(samples, VoiceBufferBuilder.SampleRate);
    }
}
