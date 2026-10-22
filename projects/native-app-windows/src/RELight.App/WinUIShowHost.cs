using Microsoft.UI.Dispatching;
using RELight.Core;
using RELight.Show;
using RELight.Windows;
using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.Media.Devices;
using Windows.Devices.Enumeration;

namespace RELight.App;

/// <summary>
/// Media Foundation/MediaPlayer adapter for the WinUI host. The preview player
/// is muted and the audience player carries film audio. Both are driven from
/// the same scene clock and seek requests. Seek accuracy, audio endpoint
/// selection and GPU behaviour still require the Phase 0 measurements on
/// Windows.
/// </summary>
public sealed class WinUIShowHost : IShowHost, IShowMediaHost, IDisposable
{
    private readonly Func<Project> _project;
    private readonly Func<string> _root;
    private readonly DispatcherQueue? _dispatcher;
    private readonly object _statusGate = new();
    private readonly object _outputGate = new();
    private MediaStatus _status = MediaStatus.Idle;
    private string? _routedOutputId;
    private string? _error;
    private long _generation;
    private long _pendingInFrame;
    private MediaSource? _previewSource;
    private MediaSource? _audienceSource;
    private bool _previewOpened;
    private bool _audienceOpened;
    private bool _black;
    private bool _disposed;

    public WinUIShowHost(Func<Project> project, Func<string> root)
    {
        _project = project ?? throw new ArgumentNullException(nameof(project));
        _root = root ?? throw new ArgumentNullException(nameof(root));
        _dispatcher = DispatcherQueue.GetForCurrentThread();
        Audio = new WindowsAudioHost(() => _project().Rate);

        PreviewPlayer = new MediaPlayer
        {
            AutoPlay = false,
            IsMuted = true
        };

        AudiencePlayer = new MediaPlayer
        {
            AutoPlay = false,
            IsMuted = false
        };

        PreviewPlayer.MediaOpened += OnMediaOpened;
        PreviewPlayer.MediaFailed += OnMediaFailed;
        AudiencePlayer.MediaOpened += OnMediaOpened;
        AudiencePlayer.MediaFailed += OnMediaFailed;
    }

    public event EventHandler? OpenAudienceRequested;

    public event EventHandler? CloseAudienceRequested;

    public event EventHandler<bool>? BlackChanged;

    public MediaPlayer PreviewPlayer { get; }

    public MediaPlayer AudiencePlayer { get; }

    public IShowMediaHost Media => this;

    public IShowAudioHost Audio { get; }

    public MediaStatus Status
    {
        get
        {
            lock (_statusGate)
            {
                return _status;
            }
        }
    }

    public string? Error
    {
        get
        {
            lock (_statusGate)
            {
                return _error;
            }
        }
    }

    public double PositionSeconds
    {
        get
        {
            try
            {
                return PreviewPlayer.PlaybackSession.Position.TotalSeconds;
            }
            catch (Exception)
            {
                return 0;
            }
        }
    }

    public bool Black => _black;

    public bool IsOutputRouted(string deviceId)
    {
        lock (_outputGate)
        {
            return !string.IsNullOrWhiteSpace(deviceId) &&
                   string.Equals(_routedOutputId, deviceId, StringComparison.OrdinalIgnoreCase);
        }
    }

    public Func<Scene, bool>? MediaAvailability { get; set; }

    public bool HasPlayableMedia(Scene scene) =>
        scene.Media is not null && (MediaAvailability?.Invoke(scene) ?? false);

    public void Prepare(Scene scene)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (scene.Media is null)
        {
            SetFailed("Scene media is unavailable");
            return;
        }

        var path = _project().AssetPath(scene.Media, _root());
        if (path is null || !File.Exists(path))
        {
            SetFailed("Scene media is missing or outside the project");
            return;
        }

        var generation = Interlocked.Increment(ref _generation);
        MediaSource preview;
        MediaSource audience;

        try
        {
            var uri = new Uri(path);
            preview = MediaSource.CreateFromUri(uri);
            audience = MediaSource.CreateFromUri(uri);
        }
        catch (Exception exception)
        {
            if (generation == Volatile.Read(ref _generation))
            {
                SetFailed(exception.Message);
            }

            return;
        }

        // Publish both new sources before the players can raise MediaOpened so a
        // late event from the previous scene can never satisfy this generation.
        lock (_statusGate)
        {
            _status = MediaStatus.Preparing;
            _error = null;
            _pendingInFrame = scene.MediaInFrame;
            _previewOpened = false;
            _audienceOpened = false;
            _previewSource = preview;
            _audienceSource = audience;
        }

        try
        {
            PreviewPlayer.Source = preview;
            AudiencePlayer.Source = audience;
        }
        catch (Exception exception)
        {
            if (generation == Volatile.Read(ref _generation))
            {
                SetFailed(exception.Message);
            }
        }
    }

    public void Play(double speed)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        try
        {
            PreviewPlayer.PlaybackSession.PlaybackRate = speed;
            AudiencePlayer.PlaybackSession.PlaybackRate = speed;
            PreviewPlayer.Play();
            AudiencePlayer.Play();
        }
        catch (Exception exception)
        {
            SetFailed(exception.Message);
        }
    }

    public void Pause()
    {
        try
        {
            PreviewPlayer.Pause();
            AudiencePlayer.Pause();
        }
        catch (Exception)
        {
            // A failed/removed source is already reported through MediaFailed.
        }
    }

    public void Seek(Scene scene, long localFrame)
    {
        try
        {
            var position = TimeSpan.FromSeconds(_project().Rate.Seconds(scene.MediaInFrame + localFrame));
            PreviewPlayer.PlaybackSession.Position = position;
            AudiencePlayer.PlaybackSession.Position = position;
        }
        catch (Exception exception)
        {
            SetFailed(exception.Message);
        }
    }

    public void SetFilmVolume(double gain)
    {
        var volume = Math.Clamp(gain, 0, 1);
        try
        {
            AudiencePlayer.Volume = volume;
            PreviewPlayer.Volume = 0;
        }
        catch (Exception)
        {
            // Volume is not worth failing the run over.
        }
    }

    public void SetBlack(bool black)
    {
        if (_black == black)
        {
            return;
        }

        _black = black;
        BlackChanged?.Invoke(this, black);
    }

    public void Release()
    {
        Interlocked.Increment(ref _generation);
        Pause();
        try
        {
            PreviewPlayer.Source = null;
            AudiencePlayer.Source = null;
        }
        catch (Exception)
        {
            // Source teardown is best effort.
        }

        lock (_statusGate)
        {
            _status = MediaStatus.Idle;
            _error = null;
            _previewSource = null;
            _audienceSource = null;
            _previewOpened = false;
            _audienceOpened = false;
        }
    }

    public void OpenAudience() => OpenAudienceRequested?.Invoke(this, EventArgs.Empty);

    public void CloseAudience() => CloseAudienceRequested?.Invoke(this, EventArgs.Empty);

    public async Task SetOutputDeviceAsync(string deviceId)
    {
        if (string.IsNullOrWhiteSpace(deviceId))
        {
            PreviewPlayer.AudioDevice = null;
            AudiencePlayer.AudioDevice = null;
            lock (_outputGate)
            {
                _routedOutputId = null;
            }

            return;
        }

        var matches = await DeviceInformation.FindAllAsync(MediaDevice.GetAudioRenderSelector());
        var exact = matches
            .Where(item => string.Equals(item.Id, deviceId, StringComparison.OrdinalIgnoreCase))
            .ToArray();
        if (exact.Length > 1)
        {
            throw new ShowHostException(
                "The selected speakers match more than one video output. Choose the device again.");
        }

        var device = exact.Length == 1 ? exact[0] : null;
        if (device is null)
        {
            var partial = matches
                .Where(item =>
                    item.Id.Contains(deviceId, StringComparison.OrdinalIgnoreCase) ||
                    deviceId.Contains(item.Id, StringComparison.OrdinalIgnoreCase))
                .ToArray();
            if (partial.Length > 1)
            {
                throw new ShowHostException(
                    "The selected speakers match more than one video output. Choose the device again.");
            }

            device = partial.Length == 1 ? partial[0] : null;
        }

        if (device is null)
        {
            // NAudio endpoint IDs and Media Foundation device IDs are not always
            // the same string. Resolve by the endpoint's friendly name only when
            // exactly one render device carries that name.
            var endpoint = WindowsAudioCatalog.GetOutputs()
                .FirstOrDefault(item => string.Equals(item.Id, deviceId, StringComparison.Ordinal));
            if (endpoint is not null)
            {
                var byName = matches
                    .Where(item => string.Equals(item.Name, endpoint.Name, StringComparison.OrdinalIgnoreCase))
                    .ToArray();
                if (byName.Length == 1)
                {
                    device = byName[0];
                }
            }
        }

        if (device is null)
        {
            throw new ShowHostException(
                "The selected speakers are not available to the video player. Choose the device again.");
        }

        PreviewPlayer.AudioDevice = device;
        AudiencePlayer.AudioDevice = device;
        lock (_outputGate)
        {
            _routedOutputId = deviceId;
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        PreviewPlayer.MediaOpened -= OnMediaOpened;
        PreviewPlayer.MediaFailed -= OnMediaFailed;
        AudiencePlayer.MediaOpened -= OnMediaOpened;
        AudiencePlayer.MediaFailed -= OnMediaFailed;
        PreviewPlayer.Dispose();
        AudiencePlayer.Dispose();
        Audio.StopAll();
        (Audio as IDisposable)?.Dispose();
    }

    private void OnMediaOpened(MediaPlayer sender, object args)
    {
        if (_dispatcher is not null && !_dispatcher.HasThreadAccess)
        {
            _dispatcher.TryEnqueue(() => OnMediaOpened(sender, args));
            return;
        }

        if (_disposed)
        {
            return;
        }

        var isPreview = ReferenceEquals(sender, PreviewPlayer);
        long generation;
        long inFrame;
        bool bothOpened;
        lock (_statusGate)
        {
            var expected = isPreview ? _previewSource : _audienceSource;
            if (_status is MediaStatus.Failed or MediaStatus.Ready ||
                !IsExpectedSource(sender, expected))
            {
                return;
            }

            if (isPreview)
            {
                _previewOpened = true;
            }
            else
            {
                _audienceOpened = true;
            }

            generation = _generation;
            inFrame = _pendingInFrame;
            bothOpened = _previewOpened && _audienceOpened;
        }

        if (!bothOpened)
        {
            return;
        }

        try
        {
            var position = TimeSpan.FromSeconds(_project().Rate.Seconds(inFrame));
            PreviewPlayer.PlaybackSession.Position = position;
            AudiencePlayer.PlaybackSession.Position = position;
            lock (_statusGate)
            {
                if (generation == _generation)
                {
                    _status = MediaStatus.Ready;
                    _error = null;
                }
            }
        }
        catch (Exception exception)
        {
            if (generation == Volatile.Read(ref _generation))
            {
                SetFailed(exception.Message);
            }
        }
    }

    private void OnMediaFailed(MediaPlayer sender, MediaPlayerFailedEventArgs args)
    {
        if (_dispatcher is not null && !_dispatcher.HasThreadAccess)
        {
            _dispatcher.TryEnqueue(() => OnMediaFailed(sender, args));
            return;
        }

        if (_disposed)
        {
            return;
        }

        var isPreview = ReferenceEquals(sender, PreviewPlayer);
        lock (_statusGate)
        {
            var expected = isPreview ? _previewSource : _audienceSource;
            if (!IsExpectedSource(sender, expected))
            {
                return;
            }
        }

        SetFailed(args.ErrorMessage);
    }

    private static bool IsExpectedSource(MediaPlayer sender, MediaSource? expected)
    {
        if (expected is null)
        {
            return false;
        }

        if (ReferenceEquals(sender.Source, expected))
        {
            return true;
        }

        // C#/WinRT normally preserves object identity, but comparing the URI
        // keeps MediaOpened usable if a projection returns a fresh wrapper.
        return sender.Source is MediaSource source &&
               source.Uri is { } uri &&
               expected.Uri is { } expectedUri &&
               string.Equals(uri.AbsoluteUri, expectedUri.AbsoluteUri, StringComparison.OrdinalIgnoreCase);
    }

    private void SetFailed(string message)
    {
        lock (_statusGate)
        {
            _status = MediaStatus.Failed;
            _error = string.IsNullOrWhiteSpace(message) ? "Video playback failed" : message;
        }
    }
}
