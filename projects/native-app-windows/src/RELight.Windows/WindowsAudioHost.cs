using System.Buffers.Binary;
using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using RELight.Audio;
using RELight.Core;
using RELight.Show;

namespace RELight.Windows;

/// <summary>
/// WASAPI shared-mode capture and voice playback. Capture is converted to mono
/// and resampled to 48 kHz before it is handed to the memory-only
/// <see cref="CaptureStore"/>. Film audio remains on the MediaPlayer path.
///
/// Voice is rendered through <see cref="VoiceEffectRenderer"/> into interleaved
/// 48 kHz stereo PCM before playback, so EQ, delay, reverb, distortion, level,
/// pan and automation are baked into the buffer. The WASAPI endpoint volume is
/// held at unity. The DSP is an approximation of the Mac Audio Units and still
/// needs an A/B listening test on the exhibition kit.
/// </summary>
public sealed class WindowsAudioHost : IShowAudioHost, IDisposable
{
    private const int OutputSampleRate = 48_000;
    private static readonly Guid PcmSubFormat = new("00000001-0000-0010-8000-00AA00389B71");
    private static readonly Guid FloatSubFormat = new("00000003-0000-0010-8000-00AA00389B71");

    private readonly MMDeviceEnumerator _enumerator = new();
    private readonly Func<FrameRate> _rate;
    private readonly object _gate = new();

    private MMDevice? _input;
    private MMDevice? _output;
    private WasapiCapture? _capture;
    private CaptureStore? _store;
    private VoiceTake? _take;
    private WasapiOut? _voiceOut;
    private float[]? _voiceBuffer;
    private string _inputUid = "";
    private string _outputUid = "";
    private int _captureSampleRate = OutputSampleRate;
    private int _captureChannels = 1;
    private double _takeSeconds;
    private bool _engineRunning;
    private bool _disposed;

    public WindowsAudioHost(Func<FrameRate> rate)
    {
        _rate = rate ?? throw new ArgumentNullException(nameof(rate));
    }

    public double VoiceGain { get; set; } = 1;

    public double TakeSeconds
    {
        get
        {
            lock (_gate)
            {
                return _takeSeconds;
            }
        }
    }

    public bool CaptureFinished
    {
        get
        {
            lock (_gate)
            {
                return _store?.Finished ?? false;
            }
        }
    }

    public (double Rms, double Peak) Meter
    {
        get
        {
            lock (_gate)
            {
                if (_store is null)
                {
                    return (0, 0);
                }

                var meter = _store.Meter;
                return (meter.Rms, meter.Peak);
            }
        }
    }

    public bool VoicePlaying
    {
        get
        {
            lock (_gate)
            {
                return _voiceOut is not null;
            }
        }
    }

    public bool EngineRunning => _engineRunning;

    public bool CaptureOpen
    {
        get
        {
            lock (_gate)
            {
                return _capture is not null;
            }
        }
    }

    public void Configure(string inputUid, string outputUid)
    {
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (_inputUid == inputUid && _outputUid == outputUid && _input is not null && _output is not null)
            {
                return;
            }

            MMDevice? input = null;
            MMDevice? output = null;
            try
            {
                input = string.IsNullOrWhiteSpace(inputUid)
                    ? _enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications)
                    : _enumerator.GetDevice(inputUid);
                output = string.IsNullOrWhiteSpace(outputUid)
                    ? _enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia)
                    : _enumerator.GetDevice(outputUid);

                if (input.DataFlow != DataFlow.Capture || output.DataFlow != DataFlow.Render)
                {
                    throw new ShowHostException("The selected audio devices have the wrong direction.");
                }
            }
            catch (ShowHostException)
            {
                input?.Dispose();
                output?.Dispose();
                throw;
            }
            catch (Exception exception)
            {
                input?.Dispose();
                output?.Dispose();
                throw new ShowHostException(
                    "The selected microphone or speakers are unavailable. Choose a connected device.",
                    exception);
            }

            _input?.Dispose();
            _output?.Dispose();
            _input = input;
            _output = output;
            _inputUid = inputUid;
            _outputUid = outputUid;
        }
    }

    public void PrepareMicrophone()
    {
        lock (_gate)
        {
            if (_input is null)
            {
                throw new ShowHostException("No microphone is selected.");
            }
        }
    }

    public void BeginCapture(double seconds)
    {
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (_input is null)
            {
                throw new ShowHostException("No microphone is selected.");
            }

            StopVoiceLocked();
            ClearTakeLocked();
            ReleaseMicrophoneLocked();

            try
            {
                var capture = new WasapiCapture(_input, true, 100);
                var format = capture.WaveFormat;
                if (format.Channels < 1)
                {
                    capture.Dispose();
                    throw new ShowHostException("The selected microphone reported no channels.");
                }

                if (format.SampleRate is < 8_000 or > 96_000)
                {
                    capture.Dispose();
                    throw new ShowHostException(
                        $"The selected microphone runs at {format.SampleRate} Hz. Choose a 48 kHz device or install a resampler.");
                }

                _capture = capture;
                _captureSampleRate = format.SampleRate;
                _captureChannels = format.Channels;
                _store = new CaptureStore();
                _store.Begin(seconds, _captureSampleRate);
                capture.DataAvailable += OnDataAvailable;
                capture.RecordingStopped += OnRecordingStopped;
                capture.StartRecording();
            }
            catch (ShowHostException)
            {
                ReleaseMicrophoneLocked();
                throw;
            }
            catch (Exception exception)
            {
                ReleaseMicrophoneLocked();
                throw new ShowHostException("The selected microphone could not start recording.", exception);
            }
        }
    }

    public void FinishCapture()
    {
        lock (_gate)
        {
            if (_store is null)
            {
                throw new ShowHostException("No recording is in progress.");
            }

            StopCaptureLocked();
            var raw = _store.Finish();
            _store = null;

            var resampled = ResampleTo48k(raw.Samples, raw.SampleRate);
            if (!ReferenceEquals(resampled, raw.Samples))
            {
                Array.Clear(raw.Samples);
            }
            if (!VoiceTakeValidator.TryCreate(resampled, OutputSampleRate, out var validated, out var error))
            {
                Array.Clear(resampled);
                throw new ShowHostException(error ?? "The recording could not be used.");
            }

            _take = validated;
            _takeSeconds = validated!.DurationSeconds;
        }
    }

    public void ReleaseMicrophone()
    {
        lock (_gate)
        {
            ReleaseMicrophoneLocked();
        }
    }

    public void StartEngine() => _engineRunning = true;

    public void PauseEngine() => _engineRunning = false;

    public void Play(VoiceCue cue, double delaySeconds, double speed, long offsetFrames)
    {
        ArgumentNullException.ThrowIfNull(cue);
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (_output is null)
            {
                throw new ShowHostException("No speakers are selected.");
            }

            if (_take is null)
            {
                throw new ShowHostException("No participant recording is available.");
            }

            if (offsetFrames is < 0 or > int.MaxValue)
            {
                throw new ShowHostException("Voice region offset is outside the supported range.");
            }

            StopVoiceLocked();
            WasapiOut? output = null;
            try
            {
                var samples = VoiceEffectRenderer.Render(
                    _take,
                    cue,
                    _rate(),
                    speed: speed,
                    bus: VoiceGain,
                    offsetFrames: (int)offsetFrames);
                if (samples.Length == 0)
                {
                    throw new ShowHostException("The voice region has no audio.");
                }

                _voiceBuffer = samples;
                var format = WaveFormat.CreateIeeeFloatWaveFormat(OutputSampleRate, 2);
                var delayFrames = (int)Math.Clamp(
                    double.IsFinite(delaySeconds) ? delaySeconds * OutputSampleRate : 0,
                    0,
                    OutputSampleRate * 600.0);
                var provider = new PcmWaveProvider(samples, format, delayFrames);
                output = new WasapiOut(_output, AudioClientShareMode.Shared, useEventSync: false, latency: 100);
                output.Init(provider);
                output.Volume = 1f;
                output.Play();
                _voiceOut = output;
                output = null;
            }
            catch (ShowHostException)
            {
                output?.Dispose();
                StopVoiceLocked();
                throw;
            }
            catch (Exception exception)
            {
                output?.Dispose();
                StopVoiceLocked();
                throw new ShowHostException("The voice region could not be played.", exception);
            }
        }
    }

    public void Apply(VoiceCue cue, long localFrame)
    {
        // Level, pan and effect automation were baked by VoiceEffectRenderer
        // when the cue buffer was built. Changing endpoint gain here would apply
        // level twice and could not pan. The runner still calls Apply to keep the
        // host contract uniform across implementations.
        ArgumentNullException.ThrowIfNull(cue);
        _ = localFrame;
    }

    public void StopVoice()
    {
        lock (_gate)
        {
            StopVoiceLocked();
        }
    }

    public void ClearTake()
    {
        lock (_gate)
        {
            StopVoiceLocked();
            ClearTakeLocked();
            _takeSeconds = 0;
        }
    }

    public void StopAll()
    {
        lock (_gate)
        {
            StopVoiceLocked();
            ReleaseMicrophoneLocked();
            ClearTakeLocked();
            _takeSeconds = 0;
            _engineRunning = false;
        }
    }

    public void Dispose()
    {
        lock (_gate)
        {
            if (_disposed)
            {
                return;
            }

            StopVoiceLocked();
            ReleaseMicrophoneLocked();
            ClearTakeLocked();
            _input?.Dispose();
            _input = null;
            _output?.Dispose();
            _output = null;
            _disposed = true;
            _enumerator.Dispose();
        }
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs args)
    {
        lock (_gate)
        {
            if (_store is null || _capture is null || args.BytesRecorded <= 0)
            {
                return;
            }

            try
            {
                var samples = ConvertToFloat(args.Buffer, args.BytesRecorded, _capture.WaveFormat);
                _store.Consume(samples, _captureChannels);
            }
            catch (Exception)
            {
                // A malformed device packet must not kill the UI thread. The store
                // keeps the samples received so far; an empty take is rejected at
                // FinishCapture instead of advancing with silent audio.
            }
        }
    }

    private void OnRecordingStopped(object? sender, StoppedEventArgs args)
    {
        // Capture can stop because the device was unplugged or privacy policy
        // revoked access. The two-second topology watchdog aborts a live run when
        // the assigned endpoint disappears; FinishCapture rejects an empty take.
    }

    private static float[] ConvertToFloat(byte[] buffer, int bytesRecorded, WaveFormat format)
    {
        var blockAlign = Math.Max(1, format.BlockAlign);
        var frames = bytesRecorded / blockAlign;
        var count = frames * format.Channels;
        var samples = new float[count];
        var bits = format.BitsPerSample;
        var encoding = format.Encoding;
        if (encoding == WaveFormatEncoding.Extensible && format is WaveFormatExtensible extensible)
        {
            if (extensible.SubFormat == PcmSubFormat)
            {
                encoding = WaveFormatEncoding.Pcm;
            }
            else if (extensible.SubFormat == FloatSubFormat)
            {
                encoding = WaveFormatEncoding.IeeeFloat;
            }
        }

        switch (encoding)
        {
            case WaveFormatEncoding.IeeeFloat when bits == 32:
                Buffer.BlockCopy(buffer, 0, samples, 0, count * sizeof(float));
                return samples;
            case WaveFormatEncoding.Pcm when bits == 16:
                for (var index = 0; index < count; index++)
                {
                    samples[index] = BinaryPrimitives.ReadInt16LittleEndian(
                        buffer.AsSpan(index * 2, 2)) / 32768f;
                }

                return samples;
            case WaveFormatEncoding.Pcm when bits == 24:
                for (var index = 0; index < count; index++)
                {
                    var offset = index * 3;
                    var value = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
                    if ((value & 0x800000) != 0)
                    {
                        value |= unchecked((int)0xFF000000);
                    }

                    samples[index] = value / 8388608f;
                }

                return samples;
            case WaveFormatEncoding.Pcm when bits == 32:
                for (var index = 0; index < count; index++)
                {
                    samples[index] = BinaryPrimitives.ReadInt32LittleEndian(
                        buffer.AsSpan(index * 4, 4)) / 2147483648f;
                }

                return samples;
            case WaveFormatEncoding.Pcm when bits == 8:
                for (var index = 0; index < count; index++)
                {
                    samples[index] = (buffer[index] - 128) / 128f;
                }

                return samples;
            default:
                throw new ShowHostException(
                    $"Unsupported microphone format: {format.Encoding}, {bits} bits.");
        }
    }

    private static float[] ResampleTo48k(float[] input, int inputRate)
    {
        if (inputRate == OutputSampleRate || input.Length == 0)
        {
            return input;
        }

        var outputLength = (int)Math.Round(input.Length * (double)OutputSampleRate / inputRate);
        if (outputLength <= 0)
        {
            return [];
        }

        var output = new float[outputLength];
        var step = (double)inputRate / OutputSampleRate;
        for (var index = 0; index < outputLength; index++)
        {
            var position = index * step;
            var left = (int)position;
            var right = Math.Min(left + 1, input.Length - 1);
            var fraction = (float)(position - left);
            output[index] = input[left] + (input[right] - input[left]) * fraction;
        }

        return output;
    }

    private void StopCaptureLocked()
    {
        if (_capture is null)
        {
            return;
        }

        try
        {
            _capture.StopRecording();
        }
        catch (Exception)
        {
            // Device removal can make StopRecording throw. Dispose still closes it.
        }

        _capture.DataAvailable -= OnDataAvailable;
        _capture.RecordingStopped -= OnRecordingStopped;
        _capture.Dispose();
        _capture = null;
    }

    private void ReleaseMicrophoneLocked()
    {
        StopCaptureLocked();
        _store?.Clear();
        _store = null;
    }

    private void ClearTakeLocked()
    {
        if (_take is not null)
        {
            Array.Clear(_take.Samples);
            _take = null;
        }

        _takeSeconds = 0;
    }

    private void StopVoiceLocked()
    {
        if (_voiceOut is not null)
        {
            try
            {
                _voiceOut.Stop();
            }
            catch (Exception)
            {
                // The output may already be gone. Disposal below is the cleanup.
            }

            _voiceOut.Dispose();
            _voiceOut = null;
        }

        if (_voiceBuffer is not null)
        {
            Array.Clear(_voiceBuffer);
            _voiceBuffer = null;
        }
    }

    /// <summary>
    /// Plays an in-memory interleaved float buffer without copying it into a
    /// second bounded queue. A leading silence (for cue scheduling) is produced
    /// on read. Reads past the buffer return zero so WASAPI can end the stream;
    /// the runner still stops the cue at its authored end.
    /// </summary>
    private sealed class PcmWaveProvider : IWaveProvider
    {
        private readonly float[] _samples;
        private readonly long _delayBytes;
        private long _position;

        public PcmWaveProvider(float[] samples, WaveFormat format, int delayFrames)
        {
            _samples = samples;
            WaveFormat = format;
            _delayBytes = (long)Math.Max(0, delayFrames) * format.BlockAlign;
        }

        public WaveFormat WaveFormat { get; }

        public int Read(byte[] buffer, int offset, int count)
        {
            if (count <= 0)
            {
                return 0;
            }

            var target = buffer.AsSpan(offset, count);
            target.Clear();
            var sampleBytes = MemoryMarshal.AsBytes(_samples.AsSpan());
            if (_position >= _delayBytes + sampleBytes.Length)
            {
                return 0;
            }

            var end = _position + count;
            var sampleStart = Math.Max(_position, _delayBytes);
            var sampleEnd = Math.Min(end, _delayBytes + sampleBytes.Length);
            if (sampleEnd > sampleStart)
            {
                var sourceOffset = (int)Math.Min(int.MaxValue, sampleStart - _delayBytes);
                var destinationOffset = (int)(sampleStart - _position);
                var length = (int)Math.Min(int.MaxValue, sampleEnd - sampleStart);
                sampleBytes.Slice(sourceOffset, length)
                    .CopyTo(target.Slice(destinationOffset, length));
            }

            _position = end;
            return count;
        }
    }
}
