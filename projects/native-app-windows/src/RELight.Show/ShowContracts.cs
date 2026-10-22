using RELight.Core;

namespace RELight.Show;

public enum ShowState
{
    Idle,
    Preparing,
    Playing,
    Paused,
    Gate,
    Recording,
    Finished
}

public enum ShowSetup
{
    Rehearsal,
    Exhibition
}

public enum MediaStatus
{
    Idle,
    Preparing,
    Ready,
    Failed
}

public sealed record ShowEvent(DateTimeOffset At, string Text);

/// <summary>
/// Implemented by the platform media layer. The runner owns timing and policy;
/// this interface only prepares, transports and displays one scene at a time.
/// </summary>
public interface IShowMediaHost
{
    bool HasPlayableMedia(Scene scene);

    MediaStatus Status { get; }

    string? Error { get; }

    /// <summary>Absolute source position of the current item, in seconds.</summary>
    double PositionSeconds { get; }

    void Prepare(Scene scene);

    void Play(double speed);

    void Pause();

    void Seek(Scene scene, long localFrame);

    void SetFilmVolume(double gain);

    void SetBlack(bool black);

    void Release();
}

/// <summary>
/// Implemented by the platform audio layer. Participant samples never leave
/// memory and this interface has no file or serialization surface.
/// </summary>
public interface IShowAudioHost
{
    void Configure(string inputUid, string outputUid);

    void PrepareMicrophone();

    void ReleaseMicrophone();

    void StartEngine();

    void PauseEngine();

    void BeginCapture(double seconds);

    void FinishCapture();

    /// <summary>Authored voice bus gain for the current project.</summary>
    double VoiceGain { get; set; }

    double TakeSeconds { get; }

    bool CaptureFinished { get; }

    (double Rms, double Peak) Meter { get; }

    bool VoicePlaying { get; }

    void Play(VoiceCue cue, double delaySeconds, double speed, long offsetFrames);

    void Apply(VoiceCue cue, long localFrame);

    void StopVoice();

    void ClearTake();

    void StopAll();
}

public interface IShowHost
{
    IShowMediaHost Media { get; }

    IShowAudioHost Audio { get; }

    void OpenAudience();

    void CloseAudience();
}

public sealed class ShowHostException : Exception
{
    public ShowHostException(string message)
        : base(message)
    {
    }

    public ShowHostException(string message, Exception inner)
        : base(message, inner)
    {
    }
}
