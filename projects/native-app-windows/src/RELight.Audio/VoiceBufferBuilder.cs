using RELight.Core;

namespace RELight.Audio;

/// <summary>
/// Builds the region buffer for one voice cue. This is a portable port of the
/// Mac <c>preparedBuffer(for:rate:offsetFrames:)</c>: trims the source, applies
/// fades once in PCM, repeats or fills to the authored region, and inserts the
/// 5 ms splice ramps used for looped takes. Effects and device scheduling are
/// applied later by the Windows audio adapter.
/// </summary>
public static class VoiceBufferBuilder
{
    public const int SampleRate = 48_000;
    public const int MaxSamples = SampleRate * (int)CaptureCue.ManualLimitSeconds;
    public const int SpliceEdgeSamples = 240;

    public static float[] Build(VoiceTake take, VoiceCue cue, FrameRate rate, int offsetFrames = 0)
    {
        ArgumentNullException.ThrowIfNull(take);
        ArgumentNullException.ThrowIfNull(cue);
        ArgumentNullException.ThrowIfNull(rate);

        if (take.SampleRate != SampleRate)
        {
            throw new AudioException("Voice take must be converted to 48 kHz before playback.");
        }

        if (take.Samples.Length == 0)
        {
            throw new AudioException("No participant recording: DREAM-00, voice cue skipped");
        }

        if (offsetFrames < 0 || offsetFrames >= cue.LengthFrames)
        {
            throw new AudioException("Voice region has already ended");
        }

        var sourceOffsetLong = (long)(rate.Seconds(cue.SourceInFrame) * SampleRate);
        var resumeOffsetLong = (long)(rate.Seconds(offsetFrames) * SampleRate);
        if (sourceOffsetLong < 0 || sourceOffsetLong >= take.Samples.Length)
        {
            throw new AudioException("Voice trim is outside the captured recording");
        }

        if (resumeOffsetLong < 0 || resumeOffsetLong > int.MaxValue)
        {
            throw new AudioException("Voice region has already ended");
        }

        var sourceOffset = (int)sourceOffsetLong;
        var resumeOffset = (int)resumeOffsetLong;
        var sourceCount = take.Samples.Length - sourceOffset;
        if (sourceCount <= 0)
        {
            throw new AudioException("Voice trim is outside the captured recording");
        }

        var regionCount = (long)(rate.Seconds(cue.LengthFrames) * SampleRate);
        var repeatCount = cue.RepeatCount ?? 1;
        if (repeatCount < 1)
        {
            throw new AudioException("Repeat count must be at least one");
        }

        var fullCount = cue.LoopToFill == true
            ? regionCount
            : Math.Min(regionCount, (long)sourceCount * repeatCount);

        if (fullCount <= 0 || fullCount > MaxSamples)
        {
            throw new AudioException("Voice region exceeds the 10-minute memory limit");
        }

        var count = fullCount - resumeOffset;
        if (count <= 0 || count > int.MaxValue)
        {
            throw new AudioException("Voice trim is outside the captured recording");
        }

        var countInt = (int)count;
        var fullCountInt = (int)fullCount;
        var buffer = new float[countInt];
        var fadeIn = (int)Math.Min(fullCount, (long)(rate.Seconds(cue.FadeInFrames) * SampleRate));
        var fadeOut = (int)Math.Min(fullCount, (long)(rate.Seconds(cue.FadeOutFrames) * SampleRate));
        var repeats = cue.RepeatsSource;
        var edge = Math.Min(SpliceEdgeSamples, sourceCount / 2);

        for (var index = 0; index < countInt; index++)
        {
            var position = resumeOffset + index;
            var incoming = fadeIn > 0 ? Math.Min(1f, (float)position / fadeIn) : 1f;
            var outgoing = fadeOut > 0 ? Math.Min(1f, (float)(fullCountInt - 1 - position) / fadeOut) : 1f;

            float sample;
            if (repeats)
            {
                var loopPosition = position % sourceCount;
                var spliceIn = position >= sourceCount && edge > 0
                    ? Math.Min(1f, (float)loopPosition / edge)
                    : 1f;
                var spliceOut = position - loopPosition + sourceCount < fullCount && edge > 0
                    ? Math.Min(1f, (float)(sourceCount - 1 - loopPosition) / edge)
                    : 1f;
                sample = take.Samples[sourceOffset + loopPosition] * spliceIn * spliceOut;
            }
            else
            {
                sample = take.Samples[sourceOffset + resumeOffset + index];
            }

            buffer[index] = sample * incoming * outgoing;
        }

        return buffer;
    }
}
