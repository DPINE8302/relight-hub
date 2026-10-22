using System.Diagnostics;
using RELight.Core;

namespace RELight.Show;

/// <summary>
/// Portable run/edit state machine. This is the behaviour the WinUI host will
/// drive; media, audio, display and device I/O are supplied through
/// <see cref="IShowHost"/>. The Mac app remains the behavioural reference.
/// </summary>
public sealed class ShowRunner
{
    private static readonly Stopwatch WallClock = Stopwatch.StartNew();

    private readonly IShowHost _host;
    private readonly Func<double> _clock;
    private readonly Func<IReadOnlyList<string>>? _blockers;
    private readonly List<ShowEvent> _events = [];
    private readonly List<Project> _undo = [];
    private readonly List<Project> _redo = [];
    private readonly HashSet<int> _gateResolved = [];
    private readonly CueLedger _ledger = new();

    private Project _project;
    private Project? _liveProject;
    private ShowSetup _setup;
    private ShowState _state = ShowState.Idle;
    private int _selectedScene;
    private long _frame;
    private double _clockStart;
    private double _clockPosition;
    private double _preparationStarted;
    private double _captureStarted;
    private double _captureDuration;
    private double _recordingSeconds;
    private double _meter;
    private double _peak;
    private double _speed = 1;
    private double _machineVoiceAdvanceMs;
    private bool _consent;
    private bool _captureFired;
    private bool _captureForTest;
    private bool _captureManual;
    private bool _auditioning;
    private double _auditionStart;
    private bool _sceneHasMedia;
    private bool _dirty;
    private bool _needsConsent;
    private string? _issue;
    private string _note = "Project ready. Choose devices, then start a rehearsal.";
    private VoiceCue? _activeCue;

    public ShowRunner(
        Project project,
        IShowHost host,
        ShowSetup setup = ShowSetup.Rehearsal,
        Func<double>? clock = null,
        Func<IReadOnlyList<string>>? blockers = null,
        string inputUid = "",
        string outputUid = "")
    {
        ArgumentNullException.ThrowIfNull(project);
        ArgumentNullException.ThrowIfNull(host);

        _project = project.Clone();
        _host = host;
        _setup = setup;
        _clock = clock ?? (() => WallClock.Elapsed.TotalSeconds);
        _blockers = blockers;
        InputUid = inputUid;
        OutputUid = outputUid;
    }

    public event EventHandler? Changed;

    public Project Project => _project;

    public Project ActiveProject => _liveProject ?? _project;

    public ShowSetup Setup
    {
        get => _setup;
        set
        {
            if (Locked || _setup == value)
            {
                return;
            }

            _setup = value;
            _host.CloseAudience();
            _host.Audio.StopAll();
            Notify();
        }
    }

    public ShowState State => _state;

    public bool NeedsConsent => _needsConsent;

    public int SelectedScene => _selectedScene;

    public Guid? SelectedCueId { get; set; }

    public VoiceCue? SelectedCue =>
        SelectedCueId is { } id
            ? Scene.Cues.FirstOrDefault(cue => cue.Id == id)
            : null;

    public Scene Scene
    {
        get
        {
            var scenes = ActiveProject.Scenes;
            if (scenes.Count == 0)
            {
                throw new InvalidOperationException("A project needs at least one scene.");
            }

            return scenes[Math.Clamp(_selectedScene, 0, scenes.Count - 1)];
        }
    }

    public long Frame => _frame;

    public long GlobalFrame => ActiveProject.GlobalFrame(_selectedScene, _frame);

    public string Timecode => ActiveProject.Rate.Timecode(GlobalFrame);

    public double Speed
    {
        get => _speed;
        set
        {
            if (!double.IsFinite(value) || value <= 0)
            {
                return;
            }

            _speed = value;
            Notify();
        }
    }

    /// <summary>
    /// Machine-local output latency compensation in milliseconds. This is added
    /// to the project's authored <see cref="Project.OutputOffsetMs"/> when voice
    /// is scheduled, but is never written into a project or export. Positive
    /// values advance voice to compensate speaker/output latency.
    /// </summary>
    public double MachineVoiceAdvanceMs
    {
        get => _machineVoiceAdvanceMs;
        set => _machineVoiceAdvanceMs = double.IsFinite(value)
            ? Math.Clamp(value, -1_000, 1_000)
            : 0;
    }

    private double VoiceAdvanceMs => Project.OutputOffsetMs + _machineVoiceAdvanceMs;

    public bool Locked => _state is not (ShowState.Idle or ShowState.Finished) || _auditioning;

    public bool IsManualRecording => _captureManual;

    public bool IsCapturingTest => _captureForTest;

    public bool ConsentGranted => _consent;

    public bool Auditioning => _auditioning;

    public VoiceCue? ActiveCue => _activeCue;

    public double TakeSeconds => _host.Audio.TakeSeconds;

    public double RecordingSeconds => _recordingSeconds;

    public double Meter => _meter;

    public double Peak => _peak;

    public bool Dirty => _dirty;

    public string? Issue => _issue;

    public string Note => _note;

    public IReadOnlyList<ShowEvent> Events => _events;

    public IReadOnlyList<string> Blockers =>
        _blockers?.Invoke() ?? _project.Validation();

    public string InputUid { get; set; } = "";

    public string OutputUid { get; set; } = "";

    public bool HasVideo => _host.Media.HasPlayableMedia(Scene);

    public int MissingFilms =>
        _project.Scenes.Count(scene => scene.Media is null || !_host.Media.HasPlayableMedia(scene));

    public bool IsBlack =>
        _state == ShowState.Gate ||
        (_state == ShowState.Recording && !_captureForTest &&
         Scene.Capture?.Trigger == CaptureTrigger.Gate) ||
        (ActiveProject.BlackFromFrame is long black && GlobalFrame >= black);

    public double ScenePosition
    {
        get
        {
            if (_sceneHasMedia && _host.Media.Status == MediaStatus.Ready)
            {
                var source = _host.Media.PositionSeconds;
                return double.IsFinite(source)
                    ? Math.Max(0, source - ActiveProject.Rate.Seconds(Scene.MediaInFrame))
                    : 0;
            }

            var running = _state == ShowState.Playing ||
                          (_state == ShowState.Recording && Scene.Capture?.Trigger == CaptureTrigger.Automatic);
            return _clockPosition + (running ? (Now() - _clockStart) * _speed : 0);
        }
    }

    /// <summary>
    /// Starts a run when no automatic-capture consent decision is required.
    /// Returns false when blockers, a locked run or a consent prompt prevented it.
    /// </summary>
    public bool Start(bool? automaticCaptureConsent = null)
    {
        if (Locked)
        {
            return false;
        }

        var blockers = Blockers;
        if (blockers.Count > 0)
        {
            _issue = blockers[0];
            _note = _issue;
            Log(_issue);
            Notify();
            return false;
        }

        var needsConsent = _project.Scenes.Any(scene =>
            scene.Capture?.Trigger == CaptureTrigger.Automatic);
        if (needsConsent && automaticCaptureConsent is null)
        {
            _needsConsent = true;
            _note = "Automatic recording needs the participant's consent before the run can start.";
            Log(_note);
            Notify();
            return false;
        }

        _needsConsent = false;
        BeginRun(automaticCaptureConsent ?? false);
        return _issue is null && _state != ShowState.Idle;
    }

    public void BeginRun(bool consented)
    {
        if (Locked)
        {
            return;
        }

        _consent = consented;
        _needsConsent = false;
        _issue = null;
        _selectedScene = 0;
        _frame = 0;
        _liveProject = _project.Clone();
        _gateResolved.Clear();
        _host.Audio.StopAll();
        _host.Audio.VoiceGain = _project.VoiceLevel;

        try
        {
            _host.Audio.Configure(InputUid, OutputUid);
        }
        catch (Exception exception) when (exception is ShowHostException or InvalidOperationException or IOException)
        {
            Fail(exception.Message);
            return;
        }

        if (_setup == ShowSetup.Exhibition)
        {
            // Mark the run as live before asking the UI to open the projector.
            // A placement failure can then abort through the normal locked-run
            // path, and this method must not restart the scene afterwards.
            _state = ShowState.Preparing;
            try
            {
                _host.OpenAudience();
            }
            catch (Exception exception)
            {
                Fail(exception.Message);
                return;
            }

            if (_issue is not null || _state is ShowState.Idle or ShowState.Finished)
            {
                return;
            }
        }

        EnterScene(0);
        Notify();
    }

    private void EnterScene(int index)
    {
        var scenes = ActiveProject.Scenes;
        if (index < 0 || index >= scenes.Count)
        {
            FinishRun();
            return;
        }

        _selectedScene = index;
        _frame = 0;
        _ledger.Reset();
        _captureFired = false;
        _host.Audio.StopVoice();
        _activeCue = null;
        _host.Media.Pause();
        _host.Media.Release();
        _sceneHasMedia = _host.Media.HasPlayableMedia(Scene);
        _clockPosition = 0;
        _preparationStarted = Now();
        _state = ShowState.Preparing;
        _host.Media.SetFilmVolume(ActiveProject.FilmLevel);

        if (_sceneHasMedia)
        {
            try
            {
                _host.Media.Prepare(Scene);
            }
            catch (Exception exception) when (exception is ShowHostException or IOException or InvalidOperationException)
            {
                Fail(exception.Message);
                return;
            }

            if (_host.Media.Status == MediaStatus.Failed)
            {
                Fail(_host.Media.Error ?? "Scene media is unavailable");
                return;
            }
        }
        else if (_setup == ShowSetup.Exhibition)
        {
            Fail("Scene media is unavailable");
            return;
        }

        if (Scene.Capture?.Trigger == CaptureTrigger.Automatic)
        {
            _speed = 1;
        }

        if (_consent && Scene.Capture?.Trigger == CaptureTrigger.Automatic)
        {
            try
            {
                _host.Audio.PrepareMicrophone();
            }
            catch (Exception exception) when (exception is ShowHostException or InvalidOperationException)
            {
                _consent = false;
                _note = "Microphone unavailable; DREAM-00 will continue without voice.";
                Log(exception.Message);
            }
        }

        Log($"Preparing scene {index + 1}: {Scene.Name}");
        UpdateBlack();
        Notify();
    }

    public void Tick()
    {
        var now = Now();
        var meter = _host.Audio.Meter;
        _meter = meter.Rms;
        _peak = meter.Peak;

        if (_auditioning && _activeCue is { } auditionCue)
        {
            var localFrame = ActiveProject.Rate.Frame(now - _auditionStart);
            _host.Audio.Apply(auditionCue, localFrame);
            if (localFrame >= auditionCue.LengthFrames)
            {
                _host.Audio.StopVoice();
                _activeCue = null;
                _auditioning = false;
                _note = "Audition complete";
            }
        }

        if (_state == ShowState.Preparing)
        {
            if (now - _preparationStarted > 10)
            {
                Fail("Scene preparation timed out. Check media and output devices.");
                return;
            }

            if (_sceneHasMedia)
            {
                if (_host.Media.Status == MediaStatus.Failed)
                {
                    Fail($"Scene could not decode: {Scene.Name}");
                    return;
                }

                if (_host.Media.Status != MediaStatus.Ready)
                {
                    Notify();
                    return;
                }

                _host.Media.Play(_speed);
            }

            _clockStart = now;
            _state = ShowState.Playing;
            _note = $"Running {Scene.Name}";
            Log(_note);
        }

        if (_state == ShowState.Recording)
        {
            _recordingSeconds = now - _captureStarted;
            if (_host.Audio.CaptureFinished || _recordingSeconds >= _captureDuration + 0.1)
            {
                if (_captureManual)
                {
                    Log("Manual recording reached the 10-minute memory limit");
                }

                var wasTest = _captureForTest;
                var wasGate = Scene.Capture?.Trigger == CaptureTrigger.Gate;
                FinishRecording();
                if (wasTest || wasGate)
                {
                    Notify();
                    return;
                }
            }
            else if (_captureForTest || Scene.Capture?.Trigger == CaptureTrigger.Gate)
            {
                Notify();
                return;
            }
        }

        if (_state is not (ShowState.Playing or ShowState.Recording))
        {
            Notify();
            return;
        }

        var project = ActiveProject;
        var scene = Scene;
        var nextFrame = Math.Min(scene.Frames, project.Rate.Frame(ScenePosition));
        if (_frame != nextFrame)
        {
            _frame = nextFrame;
        }

        if (scene.Capture is { Trigger: CaptureTrigger.Gate, GateFrame: long gate } &&
            !_gateResolved.Contains(_selectedScene) &&
            _frame >= gate)
        {
            EnterGate();
            Notify();
            return;
        }

        if (scene.Capture is { Trigger: CaptureTrigger.Automatic } automatic &&
            !_captureFired &&
            _frame >= automatic.StartFrame)
        {
            _captureFired = true;
            if (_consent)
            {
                BeginRecording(automatic.DurationSeconds, test: false);
            }
            else
            {
                Log("Automatic capture skipped: no consent, DREAM-00");
            }
        }

        // Schedule against the scene clock, not the UI repaint cadence.
        var horizon = project.Rate.Frame(
            ScenePosition + 0.06 * _speed + Math.Max(0, VoiceAdvanceMs / 1000) * _speed);
        foreach (var cue in _ledger.Due(horizon, scene.Cues))
        {
            var desired = (project.Rate.Seconds(cue.StartFrame) - ScenePosition) / _speed -
                          VoiceAdvanceMs / 1000;
            var offset = Math.Max(0, project.Rate.Frame(-desired * _speed));
            if (offset >= cue.LengthFrames)
            {
                Log("Voice cue missed: its region has ended; skipped without replaying late");
                continue;
            }

            try
            {
                _host.Audio.Play(cue, Math.Max(0, desired), _speed, offset);
                _activeCue = cue;
                if (offset > 0)
                {
                    Log($"Voice scheduling late by {(int)(-desired * 1000)} ms · resumed at region frame {offset}");
                }

                Log($"Voice scheduled at {project.Rate.Timecode(project.GlobalFrame(_selectedScene, cue.StartFrame))} · lead {(int)(desired * 1000)} ms");
            }
            catch (Exception exception) when (exception is ShowHostException or InvalidOperationException or ArgumentException)
            {
                _note = exception.Message;
                Log(_note);
            }
        }

        if (_activeCue is { } active)
        {
            var local = active.PlaybackFrame(ScenePosition, project.Rate, VoiceAdvanceMs, _speed);
            if (local >= 0)
            {
                _host.Audio.Apply(active, local);
            }

            _host.Media.SetFilmVolume(project.FilmLevel * project.DuckLevel);
            if (local >= active.LengthFrames)
            {
                _host.Audio.StopVoice();
                _activeCue = null;
                _host.Media.SetFilmVolume(project.FilmLevel);
            }
        }

        UpdateBlack();

        if (_frame >= scene.Frames)
        {
            if (_state == ShowState.Recording)
            {
                var wasTest = _captureForTest;
                FinishRecording();
                if (wasTest)
                {
                    Notify();
                    return;
                }
            }

            if (scene.Capture?.Trigger == CaptureTrigger.Gate && !_gateResolved.Contains(_selectedScene))
            {
                EnterGate();
            }
            else
            {
                EnterScene(_selectedScene + 1);
            }
        }

        Notify();
    }

    public void TogglePlayback()
    {
        if (_state is ShowState.Idle or ShowState.Finished)
        {
            Start();
            return;
        }

        if (_state == ShowState.Playing)
        {
            _clockPosition = ScenePosition;
            _state = ShowState.Paused;
            _host.Media.Pause();
            _host.Audio.StopVoice();
            _host.Audio.PauseEngine();
            _host.Media.SetFilmVolume(IsBlack ? 0 : ActiveProject.FilmLevel);
            _note = "Paused";
            Notify();
            return;
        }

        if (_state != ShowState.Paused)
        {
            return;
        }

        try
        {
            _host.Audio.StartEngine();
            if (_activeCue is { } original && VoicePlaybackFrame(original) < original.LengthFrames)
            {
                var offset = Math.Max(0, VoicePlaybackFrame(original));
                var lead = Math.Max(
                    0,
                    (ActiveProject.Rate.Seconds(original.StartFrame) - ScenePosition) / _speed -
                    VoiceAdvanceMs / 1000);
                if (original.RepeatsSource ||
                    ActiveProject.Rate.Seconds(original.SourceInFrame + offset) < _host.Audio.TakeSeconds)
                {
                    _host.Audio.Play(original, lead, _speed, offset);
                }
                else
                {
                    _activeCue = null;
                    _host.Media.SetFilmVolume(ActiveProject.FilmLevel);
                    Log("Voice source has finished; resumed film without restarting the take");
                }
            }
        }
        catch (Exception exception) when (exception is ShowHostException or InvalidOperationException or ArgumentException)
        {
            Fail(exception.Message);
            return;
        }

        _clockStart = Now();
        _state = ShowState.Playing;
        if (_sceneHasMedia)
        {
            _host.Media.Play(_speed);
        }

        _note = "Running";
        UpdateBlack();
        Notify();
    }

    public long VoicePlaybackFrame(VoiceCue cue) =>
        cue.PlaybackFrame(ScenePosition, ActiveProject.Rate, VoiceAdvanceMs, _speed);

    public void RestartScene()
    {
        if (_state is not (ShowState.Playing or ShowState.Paused))
        {
            return;
        }

        _host.Audio.StopVoice();
        _ledger.Reset();
        EnterScene(_selectedScene);
    }

    public void NextScene()
    {
        if (_setup != ShowSetup.Rehearsal ||
            _state is not (ShowState.Playing or ShowState.Paused))
        {
            return;
        }

        if (Scene.Capture?.Trigger == CaptureTrigger.Gate &&
            !_gateResolved.Contains(_selectedScene))
        {
            EnterGate();
            return;
        }

        EnterScene(_selectedScene + 1);
    }

    private void EnterGate()
    {
        _host.Media.Pause();
        _host.Audio.StopVoice();
        _activeCue = null;
        _state = ShowState.Gate;
        _frame = Scene.Capture?.GateFrame ?? (Scene.Frames - 1);
        _clockPosition = ActiveProject.Rate.Seconds(_frame);

        if (Scene.Capture?.GateFrame is not null && _sceneHasMedia)
        {
            _host.Media.Seek(Scene, _frame);
        }

        _note = "Recording is optional. Ask the participant to consent or continue without voice.";
        try
        {
            _host.Audio.PrepareMicrophone();
        }
        catch (Exception exception) when (exception is ShowHostException or InvalidOperationException)
        {
            Log(exception.Message);
        }

        Log($"Off-clock consent gate after {Scene.Name}");
        UpdateBlack();
        Notify();
    }

    public void RecordAtGate()
    {
        if (_state != ShowState.Gate)
        {
            return;
        }

        _consent = true;
        var capture = Scene.Capture;
        var manual = capture?.RecordingMode == CaptureMode.Manual;
        BeginRecording(
            manual ? CaptureCue.ManualLimitSeconds : capture?.DurationSeconds ?? 6,
            test: false,
            manual: manual);
    }

    public void DeclineAtGate()
    {
        if (_state != ShowState.Gate)
        {
            return;
        }

        _consent = false;
        _host.Audio.ClearTake();
        _host.Audio.ReleaseMicrophone();
        _takeReset();
        _gateResolved.Add(_selectedScene);
        Log("DREAM-00 selected: recording declined");
        ContinueAfterGate();
    }

    public void RecordTest(bool manual = false)
    {
        if (Locked)
        {
            return;
        }

        try
        {
            _host.Audio.Configure(InputUid, OutputUid);
        }
        catch (Exception exception) when (exception is ShowHostException or InvalidOperationException or IOException)
        {
            _issue = exception.Message;
            Notify();
            return;
        }

        BeginRecording(
            manual ? CaptureCue.ManualLimitSeconds : 6,
            test: true,
            manual: manual);
    }

    private void BeginRecording(double duration, bool test, bool manual = false)
    {
        try
        {
            _host.Audio.BeginCapture(duration);
            _recordingSeconds = 0;
            _captureStarted = Now();
            _captureDuration = duration;
            _captureForTest = test;
            _captureManual = manual;
            _state = ShowState.Recording;
            _note = test
                ? (manual
                    ? "Recording test take · press Stop & Continue when finished"
                    : "Recording your test take. It stays in memory.")
                : (manual
                    ? "Recording participant voice · press Stop & Continue when finished"
                    : "Recording participant voice");
            Log(_note);
            Notify();
        }
        catch (Exception exception) when (exception is ShowHostException or InvalidOperationException or ArgumentException)
        {
            _issue = exception.Message;
            Log(exception.Message);
            if (test)
            {
                _state = ShowState.Idle;
                _captureForTest = false;
                _captureManual = false;
            }
            else if (Scene.Capture?.Trigger == CaptureTrigger.Gate)
            {
                _gateResolved.Add(_selectedScene);
                _consent = false;
                ContinueAfterGate();
            }
            else
            {
                _consent = false;
                _state = ShowState.Playing;
            }

            Notify();
        }
    }

    public void FinishRecording()
    {
        if (_state != ShowState.Recording)
        {
            return;
        }

        try
        {
            _host.Audio.FinishCapture();
            _note = $"{_host.Audio.TakeSeconds:0.0} seconds captured · ready for voice cues";
            Log(_note);
        }
        catch (Exception exception) when (exception is ShowHostException or InvalidOperationException or ArgumentException)
        {
            _host.Audio.ClearTake();
            _issue = exception.Message;
            Log(exception.Message);
        }

        _host.Audio.ReleaseMicrophone();
        if (_captureForTest)
        {
            _state = ShowState.Idle;
            _captureForTest = false;
            _captureManual = false;
            Notify();
            return;
        }

        if (Scene.Capture?.Trigger == CaptureTrigger.Gate)
        {
            _gateResolved.Add(_selectedScene);
            ContinueAfterGate();
        }
        else
        {
            _state = ShowState.Playing;
            Notify();
        }
    }

    private void ContinueAfterGate()
    {
        if (Scene.Capture?.GateFrame is not null)
        {
            if (_sceneHasMedia && _host.Media.Status != MediaStatus.Ready)
            {
                _preparationStarted = Now();
                _state = ShowState.Preparing;
                Notify();
            }
            else
            {
                _state = ShowState.Paused;
                TogglePlayback();
            }
        }
        else
        {
            EnterScene(_selectedScene + 1);
        }
    }

    public void Audition(VoiceCue cue, bool dry = false)
    {
        ArgumentNullException.ThrowIfNull(cue);
        if (Locked)
        {
            return;
        }

        try
        {
            _host.Audio.Configure(InputUid, OutputUid);
            _host.Audio.VoiceGain = ActiveProject.VoiceLevel;
            var playback = dry ? cue.Clone() : cue;
            playback.Bypass = dry || cue.Bypass;
            _host.Audio.Play(playback, 0, 1, 0);
            _activeCue = playback;
            _auditioning = true;
            _auditionStart = Now();
            _note = $"Auditioning {(dry ? "dry" : "processed")} voice · no projector playback";
            Log(_note);
            Notify();
        }
        catch (Exception exception) when (exception is ShowHostException or InvalidOperationException or ArgumentException)
        {
            _issue = exception.Message;
            Notify();
        }
    }

    public void Seek(long value)
    {
        if (_state is ShowState.Recording or ShowState.Gate or ShowState.Preparing)
        {
            return;
        }

        _frame = Math.Clamp(value, 0, Math.Max(0, Scene.Frames - 1));
        _host.Audio.StopVoice();
        _activeCue = null;
        _ledger.Skip(_frame, Scene.Cues);
        _clockPosition = ActiveProject.Rate.Seconds(_frame);
        _clockStart = Now();
        if (_sceneHasMedia)
        {
            _host.Media.Seek(Scene, _frame);
        }

        _host.Media.SetFilmVolume(ActiveProject.FilmLevel);
        UpdateBlack();
        Notify();
    }

    public void SelectScene(int index)
    {
        if (Locked || index < 0 || index >= _project.Scenes.Count)
        {
            return;
        }

        _selectedScene = index;
        SelectedCueId = _project.Scenes[index].Cues.FirstOrDefault()?.Id;
        _frame = 0;
        _activeCue = null;
        _ledger.Reset();
        _host.Audio.StopVoice();
        _sceneHasMedia = _host.Media.HasPlayableMedia(Scene);
        if (_sceneHasMedia)
        {
            try
            {
                _host.Media.Prepare(Scene);
            }
            catch (Exception exception) when (exception is ShowHostException or IOException or InvalidOperationException)
            {
                _issue = exception.Message;
            }
        }
        else
        {
            _host.Media.Release();
        }

        _host.Media.SetFilmVolume(_project.FilmLevel);
        _host.Media.SetBlack(false);
        Notify();
    }

    public void Mutate(Action<Project> change)
    {
        ArgumentNullException.ThrowIfNull(change);
        if (Locked)
        {
            return;
        }

        var changed = _project.Clone();
        change(changed);
        if (changed.Equals(_project))
        {
            return;
        }

        _undo.Add(_project.Clone());
        if (_undo.Count > 100)
        {
            _undo.RemoveAt(0);
        }

        _redo.Clear();
        _project = changed;
        _dirty = true;
        _issue = null;
        _host.Audio.VoiceGain = _project.VoiceLevel;
        Notify();
    }

    public void Undo()
    {
        if (Locked || _undo.Count == 0)
        {
            return;
        }

        _redo.Add(_project.Clone());
        _project = _undo[^1];
        _undo.RemoveAt(_undo.Count - 1);
        _dirty = true;
        Notify();
    }

    public void Redo()
    {
        if (Locked || _redo.Count == 0)
        {
            return;
        }

        _undo.Add(_project.Clone());
        _project = _redo[^1];
        _redo.RemoveAt(_redo.Count - 1);
        _dirty = true;
        Notify();
    }

    public void ReplaceProject(Project project)
    {
        ArgumentNullException.ThrowIfNull(project);
        if (Locked)
        {
            return;
        }

        _project = project.Clone();
        _selectedScene = 0;
        SelectedCueId = null;
        _frame = 0;
        _liveProject = null;
        _state = ShowState.Idle;
        _auditioning = false;
        _captureForTest = false;
        _captureManual = false;
        _consent = false;
        _gateResolved.Clear();
        _undo.Clear();
        _redo.Clear();
        _dirty = false;
        _issue = null;
        _host.Audio.StopAll();
        _host.Media.Release();
        _host.Media.SetFilmVolume(_project.FilmLevel);
        _host.Media.SetBlack(false);
        _host.Audio.VoiceGain = _project.VoiceLevel;
        Notify();
    }

    public void MarkSaved() => _dirty = false;

    public void DismissIssue()
    {
        _issue = null;
        Notify();
    }

    /// <summary>
    /// Fails closed when an external safety dependency (for example a
    /// disconnected production control) disappears. The run stops and the
    /// reason is retained in the issue and event log.
    /// </summary>
    public void Abort(string text)
    {
        if (_state is ShowState.Idle or ShowState.Finished)
        {
            return;
        }

        Fail(string.IsNullOrWhiteSpace(text) ? "The run was stopped." : text);
    }

    public void Stop(bool clearMessage = true)
    {
        _host.Media.Pause();
        _host.Media.Release();
        _host.Audio.StopAll();
        _activeCue = null;
        _liveProject = null;
        _state = ShowState.Idle;
        _auditioning = false;
        _captureForTest = false;
        _captureManual = false;
        _recordingSeconds = 0;
        _captureFired = false;
        _consent = false;
        _gateResolved.Clear();
        _frame = 0;
        _selectedScene = Math.Clamp(_selectedScene, 0, Math.Max(0, _project.Scenes.Count - 1));
        _host.Media.SetFilmVolume(_project.FilmLevel);
        _host.Media.SetBlack(false);

        if (clearMessage)
        {
            _issue = null;
            _note = "Stopped. Participant recording and effect tails cleared.";
            Log(_note);
        }

        Notify();
    }

    private void FinishRun()
    {
        _host.Media.Pause();
        _host.Media.Release();
        _host.Audio.StopAll();
        _activeCue = null;
        _liveProject = null;
        _state = ShowState.Finished;
        _consent = false;
        _recordingSeconds = 0;
        _captureForTest = false;
        _captureManual = false;
        _host.Media.SetBlack(true);
        _note = "Run complete. Participant voice cleared.";
        Log(_note);
        Notify();
    }

    private void Fail(string text)
    {
        Stop(clearMessage: false);
        _issue = text;
        _note = text;
        Log(text);
        Notify();
    }

    private void UpdateBlack()
    {
        var black = IsBlack;
        _host.Media.SetBlack(black);
        if (black)
        {
            _host.Media.SetFilmVolume(0);
            _host.Audio.StopVoice();
            _activeCue = null;
        }
        else if (_activeCue is null)
        {
            _host.Media.SetFilmVolume(ActiveProject.FilmLevel);
        }
    }

    private void Log(string text)
    {
        _events.Insert(0, new ShowEvent(DateTimeOffset.UtcNow, text));
        if (_events.Count > 100)
        {
            _events.RemoveAt(100);
        }
    }

    private void Notify() => Changed?.Invoke(this, EventArgs.Empty);

    private double Now() => _clock();

    private void _takeReset()
    {
        _recordingSeconds = 0;
        _captureForTest = false;
        _captureManual = false;
    }
}
