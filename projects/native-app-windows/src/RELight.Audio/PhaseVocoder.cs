using System;

namespace RELight.Audio;

/// <summary>
/// Offline phase-vocoder time-stretch used by rehearsal playback. The Mac app
/// uses <c>AVAudioUnitTimePitch</c>; this portable implementation keeps the
/// pitch while changing duration so 2x/4x rehearsal does not turn the
/// participant's voice into a chipmunk. Exhibition always runs at 1x.
///
/// The frame size is 1024 samples with a 256-sample synthesis hop. At 4x the
/// analysis hop equals the frame size, which is the highest ratio supported by
/// this window. <see cref="VoiceEffectRenderer"/> only requests 1x, 2x and 4x.
/// </summary>
internal static class PhaseVocoder
{
    private const int FrameSize = 1024;
    private const int SynthesisHop = FrameSize / 4;
    private const int Half = FrameSize / 2;
    private const double TwoPi = Math.PI * 2;

    public static float[] Stretch(float[] source, double speed)
    {
        ArgumentNullException.ThrowIfNull(source);
        if (source.Length == 0)
        {
            return [];
        }

        if (Math.Abs(speed - 1) < 1e-9)
        {
            return (float[])source.Clone();
        }

        if (double.IsNaN(speed) || double.IsInfinity(speed) || speed is < 0.25 or > 4)
        {
            throw new AudioException("Unsupported pitch-preserving speed");
        }

        var targetLength = Math.Max(1, (int)Math.Ceiling(source.Length / speed));
        var output = new float[targetLength];
        var windowSum = new double[targetLength + FrameSize];
        var window = new double[FrameSize];
        for (var index = 0; index < FrameSize; index++)
        {
            window[index] = 0.5 - 0.5 * Math.Cos(TwoPi * index / FrameSize);
        }

        var bitReverse = BuildBitReverse();
        var cosine = new double[Half + 1];
        var sine = new double[Half + 1];
        for (var index = 0; index <= Half; index++)
        {
            var angle = TwoPi * index / FrameSize;
            cosine[index] = Math.Cos(angle);
            sine[index] = Math.Sin(angle);
        }

        var real = new double[FrameSize];
        var imaginary = new double[FrameSize];
        var outputReal = new double[FrameSize];
        var outputImaginary = new double[FrameSize];
        var previousPhase = new double[Half + 1];
        var sumPhase = new double[Half + 1];
        var analysisHop = SynthesisHop * speed;
        var firstFrame = true;
        var frameCount = (int)Math.Ceiling(source.Length / analysisHop);

        for (var frame = 0; frame < frameCount; frame++)
        {
            Array.Clear(real);
            Array.Clear(imaginary);
            var sourceStart = (int)Math.Round(frame * analysisHop);
            for (var index = 0; index < FrameSize; index++)
            {
                var sourceIndex = sourceStart + index;
                if (sourceIndex >= source.Length)
                {
                    break;
                }

                real[index] = source[sourceIndex] * window[index];
            }

            Fft(real, imaginary, bitReverse, cosine, sine, inverse: false);

            Array.Clear(outputReal);
            Array.Clear(outputImaginary);
            for (var bin = 0; bin <= Half; bin++)
            {
                var magnitude = Math.Sqrt(
                    real[bin] * real[bin] + imaginary[bin] * imaginary[bin]);
                var phase = Math.Atan2(imaginary[bin], real[bin]);

                if (bin == 0 || bin == Half)
                {
                    // DC and Nyquist have no imaginary component after a real
                    // inverse transform. Keep their magnitude and zero phase.
                    outputReal[bin] = magnitude;
                    continue;
                }

                if (firstFrame)
                {
                    sumPhase[bin] = phase;
                }
                else
                {
                    var expected = TwoPi * bin * analysisHop / FrameSize;
                    var delta = Wrap(phase - previousPhase[bin] - expected);
                    var analysisAdvance = expected + delta;
                    sumPhase[bin] += analysisAdvance * SynthesisHop / analysisHop;
                }

                previousPhase[bin] = phase;
                outputReal[bin] = magnitude * Math.Cos(sumPhase[bin]);
                outputImaginary[bin] = magnitude * Math.Sin(sumPhase[bin]);
            }

            firstFrame = false;

            // Build the conjugate-symmetric upper half explicitly. This keeps
            // the inverse transform real even after the phase is rebased.
            for (var bin = 1; bin < Half; bin++)
            {
                outputReal[FrameSize - bin] = outputReal[bin];
                outputImaginary[FrameSize - bin] = -outputImaginary[bin];
            }

            outputImaginary[0] = 0;
            outputImaginary[Half] = 0;

            Fft(outputReal, outputImaginary, bitReverse, cosine, sine, inverse: true);

            var outputStart = frame * SynthesisHop;
            for (var index = 0; index < FrameSize; index++)
            {
                var outputIndex = outputStart + index;
                if (outputIndex >= targetLength)
                {
                    break;
                }

                output[outputIndex] += (float)(outputReal[index] * window[index]);
                windowSum[outputIndex] += window[index] * window[index];
            }
        }

        for (var index = 0; index < targetLength; index++)
        {
            if (windowSum[index] > 1e-9)
            {
                output[index] = (float)(output[index] / windowSum[index]);
            }
        }

        return output;
    }

    private static double Wrap(double phase)
    {
        phase -= TwoPi * Math.Round(phase / TwoPi);
        return phase;
    }

    private static int[] BuildBitReverse()
    {
        var bits = 0;
        while ((1 << bits) < FrameSize)
        {
            bits++;
        }

        var result = new int[FrameSize];
        for (var index = 0; index < FrameSize; index++)
        {
            var value = index;
            var reversed = 0;
            for (var bit = 0; bit < bits; bit++)
            {
                reversed = (reversed << 1) | (value & 1);
                value >>= 1;
            }

            result[index] = reversed;
        }

        return result;
    }

    private static void Fft(
        double[] real,
        double[] imaginary,
        int[] bitReverse,
        double[] cosine,
        double[] sine,
        bool inverse)
    {
        for (var index = 0; index < FrameSize; index++)
        {
            var target = bitReverse[index];
            if (target <= index)
            {
                continue;
            }

            (real[index], real[target]) = (real[target], real[index]);
            (imaginary[index], imaginary[target]) = (imaginary[target], imaginary[index]);
        }

        var sign = inverse ? 1 : -1;
        for (var size = 2; size <= FrameSize; size <<= 1)
        {
            var half = size / 2;
            var step = FrameSize / size;
            for (var start = 0; start < FrameSize; start += size)
            {
                for (var offset = 0; offset < half; offset++)
                {
                    var tableIndex = offset * step;
                    var cos = cosine[tableIndex];
                    var sin = sign * sine[tableIndex];
                    var even = start + offset;
                    var odd = even + half;
                    var oddReal = real[odd] * cos - imaginary[odd] * sin;
                    var oddImaginary = real[odd] * sin + imaginary[odd] * cos;
                    var evenReal = real[even];
                    var evenImaginary = imaginary[even];
                    real[even] = evenReal + oddReal;
                    imaginary[even] = evenImaginary + oddImaginary;
                    real[odd] = evenReal - oddReal;
                    imaginary[odd] = evenImaginary - oddImaginary;
                }
            }
        }

        if (!inverse)
        {
            return;
        }

        for (var index = 0; index < FrameSize; index++)
        {
            real[index] /= FrameSize;
            imaginary[index] /= FrameSize;
        }
    }
}
