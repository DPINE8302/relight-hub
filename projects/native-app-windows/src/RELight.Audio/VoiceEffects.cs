using RELight.Core;

namespace RELight.Audio;

/// <summary>
/// Portable voice effect chain for Windows. The Mac graph is
/// timePitch → low-pass EQ → distortion → delay → medium-room reverb →
/// dynamics limiter → pan/level. This renderer reproduces that order and the
/// authored automation at a 256-sample control rate, then returns interleaved
/// stereo PCM. It is deliberately offline: the Windows host renders one cue
/// before handing it to WASAPI, so effect tails never outlive the cue region.
///
/// The reverb, distortion curve and limiter are deterministic approximations of
/// Apple's Audio Unit presets, not bit-identical emulations. They still need an
/// A/B listening test on the exhibition kit.
/// </summary>
public static class VoiceEffectRenderer
{
    public const int SampleRate = VoiceBufferBuilder.SampleRate;
    public const int ControlBlockSamples = 256;
    public const int LimiterLookaheadSamples = 240;

    public static float[] Render(
        VoiceTake take,
        VoiceCue cue,
        FrameRate rate,
        double speed = 1,
        double bus = 1,
        int offsetFrames = 0,
        int sampleRate = SampleRate)
    {
        ArgumentNullException.ThrowIfNull(take);
        ArgumentNullException.ThrowIfNull(cue);
        ArgumentNullException.ThrowIfNull(rate);

        if (sampleRate is < 8_000 or > 192_000)
        {
            throw new AudioException("Unsupported voice render sample rate");
        }

        if (double.IsNaN(speed) || double.IsInfinity(speed) || speed is < 0.25 or > 8)
        {
            throw new AudioException("Unsupported voice playback speed");
        }

        if (double.IsNaN(bus) || double.IsInfinity(bus))
        {
            throw new AudioException("Unsupported voice bus level");
        }

        var dry = VoiceBufferBuilder.Build(take, cue, rate, offsetFrames);
        var stretched = speed == 1
            ? dry
            : speed <= 4
                ? PhaseVocoder.Stretch(dry, speed)
                : Resample(dry, speed);
        if (!ReferenceEquals(stretched, dry))
        {
            Array.Clear(dry);
        }

        if (stretched.Length == 0)
        {
            return [];
        }

        var output = new float[checked(stretched.Length * 2)];
        var lowPass = new BiquadLowPass(sampleRate);
        var distortion = new SoftDistortion();
        var delay = new FeedbackDelay(sampleRate);
        var reverb = new FreeverbLite(sampleRate);
        var limiter = new LookaheadLimiter(sampleRate);
        var bypass = cue.Bypass;
        var lastBlock = -1;
        var level = 1.0;
        var pan = 0.0;
        var lowPassHz = 18_000.0;
        var delayMs = 0.0;
        var delayWet = 0.0;
        var feedback = 0.0;
        var reverbWet = 0.0;
        var distortionWet = 0.0;

        for (var frame = 0; frame < stretched.Length; frame++)
        {
            var block = frame / ControlBlockSamples;
            if (block != lastBlock)
            {
                lastBlock = block;
                var localFrame = offsetFrames +
                    (long)Math.Floor(frame * rate.Fps * speed / sampleRate);
                level = Clamp(cue.Value(EffectParameter.Level, localFrame), 0, 1);
                pan = Clamp(cue.Value(EffectParameter.Pan, localFrame), -1, 1);
                lowPassHz = Clamp(cue.Value(EffectParameter.LowPassHz, localFrame), 120, 20_000);
                delayMs = Clamp(cue.Value(EffectParameter.DelayMs, localFrame), 0, 2_000);
                delayWet = delayMs > 0
                    ? Clamp(cue.Value(EffectParameter.DelayWet, localFrame), 0, 1)
                    : 0;
                feedback = Clamp(cue.Value(EffectParameter.Feedback, localFrame), 0, 0.38);
                reverbWet = Clamp(cue.Value(EffectParameter.ReverbWet, localFrame), 0, 1);
                distortionWet = Clamp(cue.Value(EffectParameter.Distortion, localFrame), 0, 1);
                lowPass.SetCutoff(lowPassHz);
                delay.SetParameters(delayMs, feedback, delayWet);
                reverb.SetWet(reverbWet);
                distortion.SetWet(distortionWet);
            }

            var sample = stretched[frame] * level * bus;
            if (!bypass)
            {
                sample = lowPass.Process(sample);
                sample = distortion.Process(sample);
                sample = delay.Process(sample);
                sample = reverb.Process(sample);
            }

            var (left, right) = limiter.Process(sample, sample);
            var leftGain = 1 - Math.Max(0, pan);
            var rightGain = 1 + Math.Min(0, pan);

            // Linear pan keeps a centred voice at unity in both channels, matching
            // the mixer's centre position more closely than a -3 dB equal-power law.
            output[frame * 2] = (float)Math.Clamp(left * leftGain, -1, 1);
            output[frame * 2 + 1] = (float)Math.Clamp(right * rightGain, -1, 1);
        }

        // The returned mix is the only buffer that leaves this method. Clear the
        // source/effect state so a stopped or completed cue does not leave voice
        // samples waiting for the garbage collector.
        Array.Clear(stretched);
        lowPass.Clear();
        delay.Clear();
        reverb.Clear();
        limiter.Clear();
        return output;
    }

    private static float[] Resample(float[] source, double speed)
    {
        var count = Math.Max(1, (int)Math.Ceiling(source.Length / speed));
        var output = new float[count];
        for (var index = 0; index < count; index++)
        {
            var position = index * speed;
            var left = (int)Math.Floor(position);
            if (left >= source.Length)
            {
                break;
            }

            var fraction = (float)(position - left);
            var a = source[left];
            var b = left + 1 < source.Length ? source[left + 1] : 0;
            output[index] = a + (b - a) * fraction;
        }

        return output;
    }

    private static double Clamp(double value, double minimum, double maximum)
    {
        if (double.IsNaN(value))
        {
            return minimum;
        }

        return Math.Clamp(value, minimum, maximum);
    }

    private sealed class BiquadLowPass
    {
        private readonly int _sampleRate;
        private double _b0 = 1;
        private double _b1;
        private double _b2;
        private double _a1;
        private double _a2;
        private double _z1;
        private double _z2;

        public BiquadLowPass(int sampleRate)
        {
            _sampleRate = sampleRate;
        }

        public void Clear()
        {
            _z1 = 0;
            _z2 = 0;
        }

        public void SetCutoff(double frequency)
        {
            var cutoff = Math.Clamp(frequency, 20, _sampleRate * 0.45);
            var omega = 2 * Math.PI * cutoff / _sampleRate;
            var cosine = Math.Cos(omega);
            var alpha = Math.Sin(omega) / (2 * 0.7071067811865476);
            var a0 = 1 + alpha;
            _b0 = (1 - cosine) / 2 / a0;
            _b1 = (1 - cosine) / a0;
            _b2 = _b0;
            _a1 = -2 * cosine / a0;
            _a2 = (1 - alpha) / a0;
        }

        public double Process(double input)
        {
            var output = _b0 * input + _z1;
            _z1 = _b1 * input - _a1 * output + _z2;
            _z2 = _b2 * input - _a2 * output;
            return output;
        }
    }

    private sealed class SoftDistortion
    {
        private double _wet;

        public void SetWet(double wet) => _wet = Math.Clamp(wet, 0, 1);

        public double Process(double input)
        {
            if (_wet <= 0)
            {
                return input;
            }

            var drive = 1 + 10 * _wet;
            var shaped = Math.Tanh(input * drive) / Math.Tanh(drive);
            return input * (1 - _wet) + shaped * _wet;
        }
    }

    private sealed class FeedbackDelay
    {
        private readonly int _sampleRate;
        private readonly double[] _buffer;
        private int _write;
        private double _delaySamples;
        private double _feedback;
        private double _wet;

        public FeedbackDelay(int sampleRate)
        {
            _sampleRate = sampleRate;
            _buffer = new double[sampleRate * 2 + 4];
        }

        public void SetParameters(double delayMs, double feedback, double wet)
        {
            _delaySamples = Math.Clamp(delayMs, 0, 2_000) * _sampleRate / 1000.0;
            _feedback = Math.Clamp(feedback, 0, 0.38);
            _wet = Math.Clamp(wet, 0, 1);
        }

        public void Clear()
        {
            Array.Clear(_buffer);
            _write = 0;
            _wet = 0;
        }

        public double Process(double input)
        {
            if (_delaySamples < 1 || _wet <= 0)
            {
                _buffer[_write] = input;
                _write = (_write + 1) % _buffer.Length;
                return input;
            }

            var read = _write - _delaySamples;
            while (read < 0)
            {
                read += _buffer.Length;
            }

            var first = (int)Math.Floor(read);
            var fraction = read - first;
            var a = _buffer[first % _buffer.Length];
            var b = _buffer[(first + 1) % _buffer.Length];
            var delayed = a + (b - a) * fraction;
            _buffer[_write] = input + delayed * _feedback;
            _write = (_write + 1) % _buffer.Length;
            return input * (1 - _wet) + delayed * _wet;
        }
    }

    /// <summary>
    /// Compact Freeverb-inspired four-comb, two-allpass room. The Mac uses
    /// AVAudioUnitReverb's mediumRoom preset; this is a deterministic stand-in.
    /// </summary>
    private sealed class FreeverbLite
    {
        private readonly Comb[] _combs;
        private readonly AllPass[] _allPasses;
        private double _wet;

        public FreeverbLite(int sampleRate)
        {
            var scale = sampleRate / 48_000.0;
            _combs =
            [
                new Comb(Math.Max(1, (int)(1116 * scale))),
                new Comb(Math.Max(1, (int)(1188 * scale))),
                new Comb(Math.Max(1, (int)(1277 * scale))),
                new Comb(Math.Max(1, (int)(1356 * scale)))
            ];
            _allPasses =
            [
                new AllPass(Math.Max(1, (int)(556 * scale))),
                new AllPass(Math.Max(1, (int)(441 * scale)))
            ];
        }

        public void SetWet(double wet) => _wet = Math.Clamp(wet, 0, 1);

        public void Clear()
        {
            foreach (var comb in _combs)
            {
                comb.Clear();
            }

            foreach (var allPass in _allPasses)
            {
                allPass.Clear();
            }

            _wet = 0;
        }

        public double Process(double input)
        {
            if (_wet <= 0)
            {
                return input;
            }

            var sum = 0.0;
            foreach (var comb in _combs)
            {
                sum += comb.Process(input);
            }

            var wet = sum / _combs.Length;
            foreach (var allPass in _allPasses)
            {
                wet = allPass.Process(wet);
            }

            return input * (1 - _wet) + wet * _wet;
        }

        private sealed class Comb
        {
            private readonly double[] _buffer;
            private int _index;
            private double _filter;

            public Comb(int length)
            {
                _buffer = new double[length];
            }

            public void Clear()
            {
                Array.Clear(_buffer);
                _index = 0;
                _filter = 0;
            }

            public double Process(double input)
            {
                var output = _buffer[_index];
                _filter = output * 0.8 + _filter * 0.2;
                _buffer[_index] = input + _filter * 0.78;
                _index = (_index + 1) % _buffer.Length;
                return output;
            }
        }

        private sealed class AllPass
        {
            private readonly double[] _buffer;
            private int _index;

            public AllPass(int length)
            {
                _buffer = new double[length];
            }

            public void Clear()
            {
                Array.Clear(_buffer);
                _index = 0;
            }

            public double Process(double input)
            {
                var buffered = _buffer[_index];
                var output = -input + buffered;
                _buffer[_index] = input + buffered * 0.5;
                _index = (_index + 1) % _buffer.Length;
                return output;
            }
        }
    }

    private sealed class LookaheadLimiter
    {
        private const double Threshold = 0.7;
        private const double Ceiling = 0.98;
        private readonly double[] _left;
        private readonly double[] _right;
        private readonly int _lookahead;
        private readonly double _attack;
        private readonly double _release;
        private int _write;
        private double _gain = 1;

        public LookaheadLimiter(int sampleRate)
        {
            _lookahead = Math.Max(1, (int)(sampleRate * 0.005));
            _left = new double[_lookahead];
            _right = new double[_lookahead];
            _attack = Math.Exp(-1.0 / (sampleRate * 0.001));
            _release = Math.Exp(-1.0 / (sampleRate * 0.100));
        }

        public void Clear()
        {
            Array.Clear(_left);
            Array.Clear(_right);
            _write = 0;
            _gain = 1;
        }

        public (double Left, double Right) Process(double left, double right)
        {
            var peak = Math.Max(Math.Abs(left), Math.Abs(right));
            var target = peak > Threshold ? Threshold / peak : 1.0;
            var coefficient = target < _gain ? _attack : _release;
            _gain = coefficient * _gain + (1 - coefficient) * target;

            var delayedLeft = _left[_write];
            var delayedRight = _right[_write];
            _left[_write] = left;
            _right[_write] = right;
            _write = (_write + 1) % _lookahead;
            return (Math.Clamp(delayedLeft * _gain, -Ceiling, Ceiling),
                Math.Clamp(delayedRight * _gain, -Ceiling, Ceiling));
        }
    }
}
