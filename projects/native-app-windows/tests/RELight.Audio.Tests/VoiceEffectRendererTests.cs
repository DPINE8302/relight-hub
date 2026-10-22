using RELight.Core;

namespace RELight.Audio.Tests;

public sealed class VoiceEffectRendererTests
{
    [Fact]
    public void RendersUnityLevelStereoWithoutChangingTheRegionLength()
    {
        var take = ConstantTake(seconds: 2, value: 0.1f);
        var cue = new VoiceCue(0, 24)
        {
            FadeInFrames = 0,
            FadeOutFrames = 0
        };
        cue.Effects.Level = 0.5;
        cue.Effects.LowPassHz = 20_000;
        cue.Effects.DelayMs = 0;
        cue.Effects.ReverbWet = 0;
        cue.Effects.Distortion = 0;
        cue.Effects.Pan = 0;

        var output = VoiceEffectRenderer.Render(take, cue, new FrameRate(24), bus: 1);

        Assert.Equal(48_000 * 2, output.Length);
        var index = 2_400 * 2;
        Assert.Equal(0.05f, output[index], 4);
        Assert.Equal(output[index], output[index + 1], 5);
    }

    [Fact]
    public void RehearsalSpeedShortensTheRenderedRegion()
    {
        var take = ConstantTake(seconds: 2, value: 0.1f);
        var cue = new VoiceCue(0, 24) { FadeInFrames = 0, FadeOutFrames = 0 };

        var normal = VoiceEffectRenderer.Render(take, cue, new FrameRate(24), speed: 1);
        var doubleSpeed = VoiceEffectRenderer.Render(take, cue, new FrameRate(24), speed: 2);
        var quadSpeed = VoiceEffectRenderer.Render(take, cue, new FrameRate(24), speed: 4);

        Assert.Equal(normal.Length / 2, doubleSpeed.Length);
        Assert.Equal(normal.Length / 4, quadSpeed.Length);
        Assert.Contains(doubleSpeed, sample => Math.Abs(sample) > 0.01f);
        Assert.Contains(quadSpeed, sample => Math.Abs(sample) > 0.01f);
    }

    [Fact]
    public void RehearsalSpeedKeepsTheVoicePitch()
    {
        var take = SineTake(seconds: 3, frequency: 440, amplitude: 0.25f);
        var cue = new VoiceCue(0, 72)
        {
            FadeInFrames = 0,
            FadeOutFrames = 0,
            Bypass = true
        };
        cue.Effects.Level = 1;
        cue.Effects.LowPassHz = 20_000;

        var normal = VoiceEffectRenderer.Render(take, cue, new FrameRate(24), speed: 1);
        var doubleSpeed = VoiceEffectRenderer.Render(take, cue, new FrameRate(24), speed: 2);
        var quadSpeed = VoiceEffectRenderer.Render(take, cue, new FrameRate(24), speed: 4);

        // A linear resample would double/quadruple the pitch. The phase vocoder
        // must keep the 440 Hz tone near 440 Hz in every rehearsal speed.
        Assert.InRange(ZeroCrossingFrequency(normal, 4_800, 19_200), 400, 480);
        Assert.InRange(ZeroCrossingFrequency(doubleSpeed, 4_800, 19_200), 400, 480);
        Assert.InRange(ZeroCrossingFrequency(quadSpeed, 4_800, 19_200), 400, 480);
    }

    [Fact]
    public void PanMutesTheOppositeChannel()
    {
        var take = ConstantTake(seconds: 2, value: 0.1f);
        var cue = new VoiceCue(0, 24) { FadeInFrames = 0, FadeOutFrames = 0 };
        cue.Effects.Level = 1;
        cue.Effects.Pan = -1;

        var output = VoiceEffectRenderer.Render(take, cue, new FrameRate(24));
        var frame = 2_400;
        Assert.InRange(output[frame * 2], 0.095f, 0.105f);
        Assert.InRange(output[frame * 2 + 1], -0.0001f, 0.0001f);
    }

    [Fact]
    public void LowPassAndBypassFollowTheAuthoredCreativeSwitch()
    {
        var take = SineTake(seconds: 2, frequency: 10_000, amplitude: 0.2f);
        var cue = new VoiceCue(0, 24) { FadeInFrames = 0, FadeOutFrames = 0 };
        cue.Effects.LowPassHz = 500;
        cue.Effects.Level = 1;

        var filtered = VoiceEffectRenderer.Render(take, cue, new FrameRate(24));
        cue.Bypass = true;
        var bypassed = VoiceEffectRenderer.Render(take, cue, new FrameRate(24));

        Assert.True(Rms(filtered, 4_800) < Rms(bypassed, 4_800) * 0.1);
    }

    [Fact]
    public void DelayWetProducesAnAudibleEchoInsideTheCueRegion()
    {
        var samples = new float[24_000];
        samples[0] = 0.8f;
        var take = new VoiceTake(samples, VoiceEffectRenderer.SampleRate);
        var cue = new VoiceCue(0, 12) { FadeInFrames = 0, FadeOutFrames = 0 };
        cue.Effects.Level = 1;
        cue.Effects.LowPassHz = 20_000;
        cue.Effects.DelayMs = 100;
        cue.Effects.DelayWet = 1;
        cue.Effects.Feedback = 0;
        cue.Effects.ReverbWet = 0;

        var output = VoiceEffectRenderer.Render(take, cue, new FrameRate(24));

        var echoFrame = 4_800 + VoiceEffectRenderer.LimiterLookaheadSamples;
        Assert.InRange(output[echoFrame * 2], 0.2f, 0.8f);
        Assert.InRange(output[echoFrame * 2 + 1], 0.2f, 0.8f);
    }

    [Fact]
    public void LimiterBoundsTheOutput()
    {
        var take = ConstantTake(seconds: 1, value: 2.0f);
        var cue = new VoiceCue(0, 24) { FadeInFrames = 0, FadeOutFrames = 0 };
        cue.Effects.Level = 1;
        cue.Effects.LowPassHz = 20_000;

        var output = VoiceEffectRenderer.Render(take, cue, new FrameRate(24));

        Assert.All(output, sample => Assert.InRange(sample, -0.9801f, 0.9801f));
        Assert.Contains(output, sample => Math.Abs(sample) > 0.5f);
    }

    [Fact]
    public void PanAutomationMovesAcrossTheRegion()
    {
        var take = ConstantTake(seconds: 2, value: 0.1f);
        var cue = new VoiceCue(0, 24) { FadeInFrames = 0, FadeOutFrames = 0 };
        cue.Effects.Level = 1;
        cue.Effects.Pan = -1;
        cue.Automation["pan"] =
        [
            new AutomationPoint { Frame = 0, Value = -1 },
            new AutomationPoint { Frame = 24, Value = 1 }
        ];

        var output = VoiceEffectRenderer.Render(take, cue, new FrameRate(24));

        var early = 2_400 * 2;
        var late = 44_000 * 2;
        Assert.True(output[early] > output[early + 1]);
        Assert.True(output[late + 1] > output[late]);
    }

    private static double ZeroCrossingFrequency(float[] stereo, int startFrame, int endFrame)
    {
        var crossings = 0;
        var previous = stereo[Math.Clamp(startFrame, 0, stereo.Length / 2 - 1) * 2];
        for (var frame = startFrame + 1; frame < endFrame; frame++)
        {
            var current = stereo[frame * 2];
            if ((previous <= 0 && current > 0) || (previous >= 0 && current < 0))
            {
                crossings++;
            }

            previous = current;
        }

        var seconds = (endFrame - startFrame) / (double)VoiceEffectRenderer.SampleRate;
        return seconds <= 0 ? 0 : crossings / (2 * seconds);
    }

    private static double Rms(float[] stereo, int startFrame)
    {
        var sum = 0.0;
        var count = 0;
        for (var frame = startFrame; frame < stereo.Length / 2; frame++)
        {
            var value = stereo[frame * 2];
            sum += value * value;
            count++;
        }

        return count == 0 ? 0 : Math.Sqrt(sum / count);
    }

    private static VoiceTake ConstantTake(double seconds, float value) =>
        new(Enumerable.Repeat(value, (int)(seconds * VoiceEffectRenderer.SampleRate)).ToArray(),
            VoiceEffectRenderer.SampleRate);

    private static VoiceTake SineTake(double seconds, double frequency, float amplitude)
    {
        var samples = new float[(int)(seconds * VoiceEffectRenderer.SampleRate)];
        for (var index = 0; index < samples.Length; index++)
        {
            samples[index] = (float)(Math.Sin(index * 2 * Math.PI * frequency / VoiceEffectRenderer.SampleRate) * amplitude);
        }

        return new VoiceTake(samples, VoiceEffectRenderer.SampleRate);
    }
}
