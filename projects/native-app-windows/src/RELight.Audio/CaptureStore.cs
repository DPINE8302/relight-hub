using RELight.Core;

namespace RELight.Audio;

public sealed class AudioException : Exception
{
    public AudioException(string message)
        : base(message)
    {
    }
}

/// <summary>
/// One in-memory participant take. The Mac app captures at 48 kHz mono; the
/// Windows WASAPI adapter is responsible for resampling into that format before
/// handing samples to the store. No file or serialized project ever contains it.
/// </summary>
public sealed record VoiceTake(float[] Samples, int SampleRate)
{
    public double DurationSeconds => SampleRate > 0 ? Samples.Length / (double)SampleRate : 0;
}

public static class VoiceTakeValidator
{
    public const double SilenceRms = 0.001;

    public static bool TryCreate(
        float[] samples,
        int sampleRate,
        out VoiceTake? take,
        out string? error)
    {
        ArgumentNullException.ThrowIfNull(samples);
        if (samples.Length == 0)
        {
            take = null;
            error = "No recording was captured. Continuing without voice (DREAM-00).";
            return false;
        }

        var sum = 0.0;
        foreach (var sample in samples)
        {
            sum += sample * sample;
        }

        var rms = Math.Sqrt(sum / samples.Length);
        if (rms <= SilenceRms)
        {
            take = null;
            error = "Recording was silent. Continuing without voice (DREAM-00).";
            return false;
        }

        take = new VoiceTake(samples, sampleRate);
        error = null;
        return true;
    }

    public static VoiceTake FinishOrThrow(CaptureStore store)
    {
        ArgumentNullException.ThrowIfNull(store);
        var take = store.Finish();
        if (!TryCreate(take.Samples, take.SampleRate, out var validated, out var error))
        {
            throw new AudioException(error!);
        }

        return validated!;
    }
}

/// <summary>
/// Bounded, memory-only capture buffer. The maximum take is fixed in samples at
/// Begin, so a manual 600-second take cannot grow without limit. This is the
/// portable half of the WASAPI capture path; device I/O lives in the Windows
/// adapter.
/// </summary>
public sealed class CaptureStore : IDisposable
{
    private readonly object _gate = new();
    private float[] _samples = [];
    private int _count;
    private int _maximum;
    private double _sampleRate = 48_000;
    private bool _recording;
    private float _rms;
    private float _peak;

    public void Begin(double seconds, int sampleRate)
    {
        if (!double.IsFinite(seconds) || seconds <= 0 || seconds > CaptureCue.ManualLimitSeconds)
        {
            throw new ArgumentOutOfRangeException(
                nameof(seconds),
                $"Recording duration must be between 0 and {CaptureCue.ManualLimitSeconds} seconds.");
        }

        if (sampleRate < 8_000 || sampleRate > 192_000)
        {
            throw new ArgumentOutOfRangeException(nameof(sampleRate), "Sample rate must be between 8 kHz and 192 kHz.");
        }

        var maximum = (int)Math.Floor(seconds * sampleRate);
        if (maximum <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(seconds), "Recording duration is too short.");
        }

        lock (_gate)
        {
            _samples = new float[maximum];
            _count = 0;
            _maximum = maximum;
            _sampleRate = sampleRate;
            _recording = true;
            _rms = 0;
            _peak = 0;
        }
    }

    public void Consume(ReadOnlySpan<float> samples) => Consume(samples, 1);

    public void Consume(ReadOnlySpan<float> samples, int channels)
    {
        if (channels < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(channels));
        }

        if (samples.Length % channels != 0)
        {
            throw new ArgumentException("Interleaved sample count is not divisible by the channel count.", nameof(samples));
        }

        lock (_gate)
        {
            var frames = samples.Length / channels;
            var sum = 0.0;
            var peak = 0f;

            for (var frame = 0; frame < frames; frame++)
            {
                var sample = 0f;
                for (var channel = 0; channel < channels; channel++)
                {
                    sample += samples[frame * channels + channel];
                }

                sample /= channels;
                sum += sample * sample;
                peak = Math.Max(peak, Math.Abs(sample));

                if (_recording && _count < _maximum)
                {
                    _samples[_count++] = sample;
                }
            }

            _rms = frames > 0 ? (float)Math.Sqrt(sum / frames) : 0f;
            _peak = peak;
            if (_count >= _maximum)
            {
                _recording = false;
            }
        }
    }

    public VoiceTake Finish()
    {
        lock (_gate)
        {
            _recording = false;
            var result = new float[_count];
            Array.Copy(_samples, result, _count);
            var rate = checked((int)_sampleRate);
            _samples = [];
            _count = 0;
            _maximum = 0;
            return new VoiceTake(result, rate);
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            _recording = false;
            _samples = [];
            _count = 0;
            _maximum = 0;
            _rms = 0;
            _peak = 0;
        }
    }

    public (float Rms, float Peak) Meter
    {
        get
        {
            lock (_gate)
            {
                return (_rms, _peak);
            }
        }
    }

    public bool Finished
    {
        get
        {
            lock (_gate)
            {
                return !_recording && _maximum > 0 && _count >= _maximum;
            }
        }
    }

    public bool IsRecording
    {
        get
        {
            lock (_gate)
            {
                return _recording;
            }
        }
    }

    public void Dispose() => Clear();
}
