using RELight.Core;
using RELight.Show;

namespace RELight.Studio.Tests;

internal sealed class FakeMediaHost : IShowMediaHost
{
    public bool AllPlayable { get; set; }

    public HashSet<Guid> PlayableScenes { get; } = [];

    public MediaStatus PrepareStatus { get; set; } = MediaStatus.Ready;

    public string? Error { get; private set; }

    public MediaStatus Status { get; private set; } = MediaStatus.Idle;

    public double PositionSeconds { get; set; }

    public FrameRate Rate { get; set; } = new();

    public Scene? PreparedScene { get; private set; }

    public bool IsPlaying { get; private set; }

    public bool IsBlack { get; private set; }

    public double FilmVolume { get; private set; }

    public double LastPlaySpeed { get; private set; }

    public List<string> Calls { get; } = [];

    public bool HasPlayableMedia(Scene scene) =>
        PlayableScenes.Contains(scene.Id) || (AllPlayable && scene.Media is not null);

    public void Prepare(Scene scene)
    {
        PreparedScene = scene;
        Status = PrepareStatus;
        Error = null;
        Calls.Add($"prepare:{scene.Name}");
        if (Status == MediaStatus.Ready)
        {
            PositionSeconds = Rate.Seconds(scene.MediaInFrame);
        }
    }

    public void Play(double speed)
    {
        IsPlaying = true;
        LastPlaySpeed = speed;
        Calls.Add("play");
    }

    public void Pause()
    {
        IsPlaying = false;
        Calls.Add("pause");
    }

    public void Seek(Scene scene, long localFrame)
    {
        PositionSeconds = Rate.Seconds(scene.MediaInFrame + localFrame);
        Calls.Add($"seek:{localFrame}");
    }

    public void SetFilmVolume(double gain)
    {
        FilmVolume = gain;
        Calls.Add($"volume:{gain:0.###}");
    }

    public void SetBlack(bool black)
    {
        IsBlack = black;
        Calls.Add($"black:{black}");
    }

    public void Release()
    {
        Status = MediaStatus.Idle;
        IsPlaying = false;
        PreparedScene = null;
        Calls.Add("release");
    }

    public void Fail(string error)
    {
        Status = MediaStatus.Failed;
        Error = error;
    }

    public void Advance(double seconds)
    {
        if (IsPlaying)
        {
            PositionSeconds += seconds;
        }
    }
}

internal sealed class FakeAudioHost : IShowAudioHost
{
    public double FinishedTakeSeconds { get; set; } = 7.2;

    public bool FailFinish { get; set; }

    public bool FailConfigure { get; set; }

    public bool FailPlay { get; set; }

    public double TakeSeconds { get; private set; }

    public double VoiceGain { get; set; } = 1;

    public bool CaptureFinished { get; private set; }

    public bool IsCapturing { get; private set; }

    public double BeginCaptureSeconds { get; private set; }

    public double MeterRms { get; set; }

    public double MeterPeak { get; set; }

    public (double Rms, double Peak) Meter => (MeterRms, MeterPeak);

    public bool VoicePlaying { get; private set; }

    public bool EngineRunning { get; private set; }

    public VoiceCue? LastPlayedCue { get; private set; }

    public double LastDelay { get; private set; }

    public double LastSpeed { get; private set; }

    public long LastOffset { get; private set; }

    public int PlayCount { get; private set; }

    public int ApplyCount { get; private set; }

    public long LastAppliedFrame { get; private set; } = -1;

    public int PrepareMicrophoneCount { get; private set; }

    public int ReleaseMicrophoneCount { get; private set; }

    public int ConfigureCount { get; private set; }

    public string LastInput { get; private set; } = "";

    public string LastOutput { get; private set; } = "";

    public List<string> Calls { get; } = [];

    public void Configure(string inputUid, string outputUid)
    {
        if (FailConfigure)
        {
            throw new ShowHostException("The selected audio device is unavailable.");
        }

        ConfigureCount++;
        LastInput = inputUid;
        LastOutput = outputUid;
        Calls.Add("configure");
    }

    public void PrepareMicrophone()
    {
        PrepareMicrophoneCount++;
        Calls.Add("prepare-mic");
    }

    public void ReleaseMicrophone()
    {
        ReleaseMicrophoneCount++;
        Calls.Add("release-mic");
    }

    public void StartEngine()
    {
        EngineRunning = true;
        Calls.Add("engine-start");
    }

    public void PauseEngine()
    {
        EngineRunning = false;
        Calls.Add("engine-pause");
    }

    public void BeginCapture(double seconds)
    {
        BeginCaptureSeconds = seconds;
        TakeSeconds = 0;
        CaptureFinished = false;
        IsCapturing = true;
        Calls.Add($"capture:{seconds}");
    }

    public void FinishCapture()
    {
        if (FailFinish)
        {
            throw new ShowHostException("Recording was silent.");
        }

        TakeSeconds = FinishedTakeSeconds;
        CaptureFinished = true;
        IsCapturing = false;
        Calls.Add("capture-finish");
    }

    public void SetCaptureFinishedForTest(bool finished) => CaptureFinished = finished;

    public void SetTakeForTest(double seconds) => TakeSeconds = seconds;

    public void Play(VoiceCue cue, double delaySeconds, double speed, long offsetFrames)
    {
        if (FailPlay)
        {
            throw new ShowHostException("The take has no usable samples.");
        }

        VoicePlaying = true;
        LastPlayedCue = cue;
        LastDelay = delaySeconds;
        LastSpeed = speed;
        LastOffset = offsetFrames;
        PlayCount++;
        Calls.Add($"play:{cue.Name}:{offsetFrames}");
    }

    public void Apply(VoiceCue cue, long localFrame)
    {
        ApplyCount++;
        LastAppliedFrame = localFrame;
        Calls.Add($"apply:{localFrame}");
    }

    public void StopVoice()
    {
        VoicePlaying = false;
        Calls.Add("stop-voice");
    }

    public void ClearTake()
    {
        TakeSeconds = 0;
        CaptureFinished = false;
        IsCapturing = false;
        Calls.Add("clear-take");
    }

    public void StopAll()
    {
        VoicePlaying = false;
        EngineRunning = false;
        TakeSeconds = 0;
        CaptureFinished = false;
        IsCapturing = false;
        MeterRms = 0;
        MeterPeak = 0;
        Calls.Add("stop-all");
    }
}

internal sealed class FakeShowHost : IShowHost
{
    public FakeShowHost()
    {
        Media = new FakeMediaHost();
        Audio = new FakeAudioHost();
    }

    public FakeMediaHost Media { get; }

    public FakeAudioHost Audio { get; }

    IShowMediaHost IShowHost.Media => Media;

    IShowAudioHost IShowHost.Audio => Audio;

    public bool AudienceOpen { get; private set; }

    public void OpenAudience() => AudienceOpen = true;

    public void CloseAudience() => AudienceOpen = false;
}

internal sealed class TestClock
{
    public double Now { get; set; }

    public double Read() => Now;
}
