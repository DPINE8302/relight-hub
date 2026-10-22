using RELight.Controls;
using RELight.Core;
using RELight.Media;
using RELight.Show;

namespace RELight.Studio;

/// <summary>
/// Portable operator-side model shared by the WinUI host and headless tests.
/// It owns project I/O, media checks, setup blockers and the run engine; it does
/// not own windows, devices or playback APIs. Async methods deliberately capture
/// the caller's synchronization context: the WinUI host requires model and
/// playback-host mutations to resume on its UI thread.
/// </summary>
public sealed class StudioViewModel
{
    private readonly ShowRunner _runner;
    private readonly Func<IReadOnlyList<string>>? _deviceBlockers;
    private Dictionary<Guid, MediaCheck> _mediaChecks = [];
    private string? _localIssue;
    private string? _localNote;

    public StudioViewModel(
        string rootDirectory,
        string projectFile,
        Project project,
        IShowHost host,
        ShowSetup setup = ShowSetup.Rehearsal,
        Func<IReadOnlyList<string>>? deviceBlockers = null,
        Func<double>? clock = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rootDirectory);
        ArgumentException.ThrowIfNullOrWhiteSpace(projectFile);
        ArgumentNullException.ThrowIfNull(project);
        ArgumentNullException.ThrowIfNull(host);

        RootDirectory = Path.GetFullPath(rootDirectory);
        ProjectFile = Path.GetFullPath(projectFile);
        _deviceBlockers = deviceBlockers;
        _runner = new ShowRunner(
            project,
            host,
            setup,
            clock: clock,
            blockers: BuildBlockers);
        _runner.Changed += (_, _) => Changed?.Invoke(this, EventArgs.Empty);
    }

    public event EventHandler? Changed;

    public ShowRunner Runner => _runner;

    public Project Project => _runner.Project;

    public Scene Scene => _runner.Scene;

    public ShowState State => _runner.State;

    public ShowSetup Setup => _runner.Setup;

    public string RootDirectory { get; private set; }

    public string ProjectFile { get; private set; }

    public IReadOnlyDictionary<Guid, MediaCheck> MediaChecks => _mediaChecks;

    public IReadOnlyList<ShowEvent> Events => _runner.Events;

    public IReadOnlyList<string> Blockers => BuildBlockers();

    public bool Dirty => _runner.Dirty;

    public bool Locked => _runner.Locked;

    public bool Auditioning => _runner.Auditioning;

    public bool NeedsConsent => _runner.NeedsConsent;

    public string? Issue => _localIssue ?? _runner.Issue;

    public string Note => _localNote ?? _runner.Note;

    public int SelectedScene => _runner.SelectedScene;

    public Guid? SelectedCueId
    {
        get => _runner.SelectedCueId;
        set => _runner.SelectedCueId = value;
    }

    public VoiceCue? SelectedCue => _runner.SelectedCue;

    public long Frame => _runner.Frame;

    public long GlobalFrame => _runner.GlobalFrame;

    public string Timecode => _runner.Timecode;

    public double TakeSeconds => _runner.TakeSeconds;

    public double RecordingSeconds => _runner.RecordingSeconds;

    public double Meter => _runner.Meter;

    public double Peak => _runner.Peak;

    public bool IsManualRecording => _runner.IsManualRecording;

    public bool IsCapturingTest => _runner.IsCapturingTest;

    public bool IsBlack => _runner.IsBlack;

    public double ScenePosition => _runner.ScenePosition;

    public double Speed
    {
        get => _runner.Speed;
        set => _runner.Speed = value;
    }

    /// <summary>Per-machine compensation layered over the authored voice advance.</summary>
    public double MachineVoiceAdvanceMs
    {
        get => _runner.MachineVoiceAdvanceMs;
        set
        {
            _runner.MachineVoiceAdvanceMs = value;
            Changed?.Invoke(this, EventArgs.Empty);
        }
    }

    public string InputUid
    {
        get => _runner.InputUid;
        set => _runner.InputUid = value;
    }

    public string OutputUid
    {
        get => _runner.OutputUid;
        set => _runner.OutputUid = value;
    }

    public int MissingFilms =>
        Project.Scenes.Count(scene => scene.Media is null || !HasVideo(scene));

    public bool HasVideo(Scene scene) =>
        scene.Media is not null &&
        _mediaChecks.TryGetValue(scene.Id, out var check) &&
        check.Valid;

    public void SetSetup(ShowSetup setup)
    {
        _runner.Setup = setup;
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public bool Start(bool? automaticCaptureConsent = null)
    {
        _localNote = null;
        var started = _runner.Start(automaticCaptureConsent);
        Changed?.Invoke(this, EventArgs.Empty);
        return started;
    }

    public void BeginRun(bool consented) => _runner.BeginRun(consented);

    public void Tick() => _runner.Tick();

    public void TogglePlayback() => _runner.TogglePlayback();

    public void Stop()
    {
        _runner.Stop();
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void NextScene() => _runner.NextScene();

    public void RestartScene() => _runner.RestartScene();

    public void RecordAtGate() => _runner.RecordAtGate();

    public void DeclineAtGate() => _runner.DeclineAtGate();

    public void FinishRecording() => _runner.FinishRecording();

    /// <summary>
    /// Applies one accepted physical-control press using the same state rules as
    /// the Mac app. The caller is responsible for only routing presses while in
    /// Exhibition and while the control has been tested in this run.
    /// </summary>
    public ControlAction ApplyControl(ControlRole role)
    {
        var action = ControlActionPolicy.Resolve(
            role,
            atGate: State == ShowState.Gate,
            recording: State == ShowState.Recording,
            recordingSeconds: RecordingSeconds);
        switch (action)
        {
            case ControlAction.RecordAtGate:
                _runner.RecordAtGate();
                break;
            case ControlAction.FinishRecording:
                _runner.FinishRecording();
                break;
            case ControlAction.DeclineAtGate:
                _runner.DeclineAtGate();
                break;
            case ControlAction.None:
            default:
                break;
        }

        Changed?.Invoke(this, EventArgs.Empty);
        return action;
    }

    public void Abort(string reason)
    {
        _runner.Abort(reason);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void RecordTest(bool manual = false) => _runner.RecordTest(manual);

    public void Audition(VoiceCue cue, bool dry = false) => _runner.Audition(cue, dry);

    public void SelectScene(int index) => _runner.SelectScene(index);

    public void Seek(long frame) => _runner.Seek(frame);

    public void Mutate(Action<Project> change)
    {
        _runner.Mutate(change);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void Undo() => _runner.Undo();

    public void Redo() => _runner.Redo();

    public void DismissIssue()
    {
        _localIssue = null;
        _runner.DismissIssue();
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void AddCue()
    {
        if (Locked)
        {
            return;
        }

        var scene = Scene;
        var length = Math.Min(144, Math.Max(1, scene.Frames));
        var start = Math.Clamp(Frame, 0, Math.Max(0, scene.Frames - length));
        var cue = new VoiceCue(start, length);
        var index = SelectedScene;
        Mutate(project => project.Scenes[index].Cues.Add(cue));
        SelectedCueId = cue.Id;
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void RemoveSelectedCue()
    {
        if (Locked || SelectedCueId is not { } id)
        {
            return;
        }

        var index = SelectedScene;
        Mutate(project => project.Scenes[index].Cues.RemoveAll(cue => cue.Id == id));
        SelectedCueId = null;
    }

    public void UpdateSelectedCue(Action<VoiceCue> change)
    {
        ArgumentNullException.ThrowIfNull(change);
        if (Locked || SelectedCueId is not { } id)
        {
            return;
        }

        var index = SelectedScene;
        Mutate(project =>
        {
            var cue = project.Scenes[index].Cues.FirstOrDefault(item => item.Id == id);
            if (cue is not null)
            {
                change(cue);
            }
        });
    }

    public async Task LoadAsync(string path, CancellationToken cancellationToken = default)
    {
        if (Locked)
        {
            throw new InvalidOperationException("Stop the run before opening another project.");
        }

        var fullPath = Path.GetFullPath(path);
        var project = await Task.Run(() => ProjectFileStore.Load(fullPath), cancellationToken);
        var root = Path.GetDirectoryName(fullPath)
            ?? throw new ProjectFileException("Project path has no directory");

        _runner.ReplaceProject(project);
        RootDirectory = root;
        ProjectFile = fullPath;
        _mediaChecks = [];
        _localIssue = null;
        _localNote = "Project opened. Validate media before an exhibition run.";
        await ValidateMediaAsync(cancellationToken);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public async Task SaveAsync(string? path = null, CancellationToken cancellationToken = default)
    {
        if (Locked)
        {
            throw new InvalidOperationException("Stop the run before saving.");
        }

        var target = Path.GetFullPath(path ?? ProjectFile);
        var snapshot = Project.Clone();
        await Task.Run(() => ProjectFileStore.Save(target, snapshot), cancellationToken);
        ProjectFile = target;
        RootDirectory = Path.GetDirectoryName(target) ?? RootDirectory;
        var unchanged = snapshot.Equals(Project);
        if (unchanged)
        {
            _runner.MarkSaved();
        }

        _localIssue = null;
        _localNote = unchanged
            ? "Project saved. Participant voice is excluded."
            : "Saved a snapshot; newer edits remain unsaved.";
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public async Task ExportAsync(string destination, CancellationToken cancellationToken = default)
    {
        if (Locked)
        {
            throw new InvalidOperationException("Stop the run before exporting.");
        }

        var snapshot = Project.Clone();
        var root = RootDirectory;
        await Task.Run(() => ProjectExport.Export(snapshot, root, destination), cancellationToken);
        _localNote = "Portable project exported.";
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public async Task ValidateMediaAsync(CancellationToken cancellationToken = default)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var snapshot = Project.Clone();
            var root = RootDirectory;
            var checks = await Task.Run(() => MediaValidator.Validate(snapshot, root), cancellationToken);
            if (!snapshot.Equals(Project) ||
                !string.Equals(root, RootDirectory, StringComparison.Ordinal))
            {
                continue;
            }

            _mediaChecks = new Dictionary<Guid, MediaCheck>(checks);
            Changed?.Invoke(this, EventArgs.Empty);
            return;
        }
    }

    public void Report(string text)
    {
        _localNote = text;
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void ReportIssue(string text)
    {
        _localIssue = text;
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private IReadOnlyList<string> BuildBlockers()
    {
        var issues = _runner.Project.Validation().ToList();

        if (_runner.Setup == ShowSetup.Exhibition)
        {
            var missing = _runner.Project.Scenes.Count(scene => scene.Media is null || !HasVideo(scene));
            if (missing > 0)
            {
                issues.Add($"{missing} scenes need valid film");
            }

            if (_runner.Project.Scenes.Any(scene => scene.Draft))
            {
                issues.Add("Approve final media for every scene in Edit");
            }
        }

        if (_deviceBlockers is not null)
        {
            issues.AddRange(_deviceBlockers());
        }

        return issues;
    }
}
