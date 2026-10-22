using RELight.Core;
using RELight.Show;

namespace RELight.Show.Tests;

public sealed class ShowRunnerTests
{
    [Fact]
    public void RehearsalUsesGateAndDeclineThenCompletes()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = null;
        var (runner, _, _) = CreateRunner(project);

        runner.BeginRun(false);
        runner.Tick();
        Assert.Equal(ShowState.Playing, runner.State);

        runner.NextScene();
        Assert.Equal(ShowState.Gate, runner.State);
        Assert.Equal(431, runner.GlobalFrame);

        runner.DeclineAtGate();
        runner.Tick();
        Assert.Equal(1, runner.SelectedScene);
        Assert.Equal(ShowState.Playing, runner.State);
        Assert.Equal(0, runner.TakeSeconds);

        for (var i = 0; i < 4; i++)
        {
            runner.NextScene();
            runner.Tick();
        }

        Assert.Equal(ShowState.Finished, runner.State);
        Assert.Equal(0, runner.TakeSeconds);
        Assert.Contains(runner.Events, item => item.Text.Contains("DREAM-00"));
    }

    [Fact]
    public void DecliningAuthoredGateResumesSameSceneWithoutRetriggering()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = null;
        project.Scenes[0].Capture!.GateFrame = 0;
        var (runner, _, _) = CreateRunner(project);

        runner.BeginRun(false);
        runner.Tick();
        Assert.Equal(ShowState.Gate, runner.State);

        runner.DeclineAtGate();
        runner.Tick();
        Assert.Equal(ShowState.Playing, runner.State);
        Assert.Equal(0, runner.SelectedScene);
        Assert.Single(runner.Events, item => item.Text.Contains("Off-clock consent gate"));

        runner.NextScene();
        runner.Tick();
        Assert.Equal(1, runner.SelectedScene);
    }

    [Fact]
    public void ManualRecordingWaitsForStopAndResumesAuthoredGateFrame()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = null;
        project.Scenes[0].Capture!.Mode = CaptureMode.Manual;
        project.Scenes[0].Capture!.GateFrame = 0;
        var (runner, host, clock) = CreateRunner(project);
        host.Audio.FinishedTakeSeconds = 7.2;

        runner.BeginRun(false);
        runner.Tick();
        Assert.Equal(ShowState.Gate, runner.State);

        runner.RecordAtGate();
        Assert.Equal(ShowState.Recording, runner.State);
        Assert.True(runner.IsManualRecording);
        Assert.Equal(CaptureCue.ManualLimitSeconds, host.Audio.BeginCaptureSeconds);

        clock.Now = 6.2;
        runner.Tick();
        Assert.Equal(ShowState.Recording, runner.State);
        Assert.Equal(0, runner.GlobalFrame);

        runner.FinishRecording();
        runner.Tick();
        Assert.Equal(ShowState.Playing, runner.State);
        Assert.Equal(0, runner.SelectedScene);
        Assert.Equal(7.2, runner.TakeSeconds);
        Assert.True(host.Audio.TakeSeconds > 0);

        runner.Stop();
        Assert.Equal(0, runner.TakeSeconds);
    }

    [Fact]
    public void RunningProjectRejectsEditsAndStopClearsVoice()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = null;
        var (runner, host, _) = CreateRunner(project);

        runner.BeginRun(false);
        runner.Tick();
        var previous = runner.Project.Title;
        runner.Mutate(changed => changed.Title = "Changed during playback");
        Assert.Equal(previous, runner.Project.Title);

        host.Audio.SetTakeForTest(0.5);
        host.Audio.MeterRms = 0.2;
        runner.Stop();
        Assert.Equal(ShowState.Idle, runner.State);
        Assert.Equal(0, runner.TakeSeconds);
        Assert.Equal(0, runner.Meter);
    }

    [Fact]
    public void PauseResumeFreezesClockAndReplaysVoiceAtOffset()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = null;
        var cue = new VoiceCue(0, 144);
        project.Scenes[0].Cues = [cue];
        var (runner, host, clock) = CreateRunner(project);

        runner.BeginRun(false);
        runner.Tick();
        host.Audio.SetTakeForTest(10);
        Assert.Equal(ShowState.Playing, runner.State);
        Assert.True(host.Audio.VoicePlaying);
        Assert.Equal(project.FilmLevel * project.DuckLevel, host.Media.FilmVolume, 6);

        clock.Now = 1;
        runner.Tick();
        Assert.Equal(24, runner.Frame);
        Assert.Equal(24, host.Audio.LastAppliedFrame);

        runner.TogglePlayback();
        Assert.Equal(ShowState.Paused, runner.State);
        Assert.False(host.Audio.VoicePlaying);
        Assert.False(host.Audio.EngineRunning);
        Assert.Equal(project.FilmLevel, host.Media.FilmVolume, 6);
        var paused = runner.ScenePosition;

        clock.Now = 1.08;
        runner.Tick();
        Assert.Equal(paused, runner.ScenePosition, 6);

        runner.TogglePlayback();
        Assert.Equal(ShowState.Playing, runner.State);
        Assert.True(host.Audio.VoicePlaying);
        Assert.True(host.Audio.EngineRunning);
        Assert.True(host.Audio.LastOffset > 0);
        Assert.Equal(1, runner.Events.Count(item => item.Text.Contains("Voice scheduled at")));

        clock.Now = 1.2;
        runner.Tick();
        Assert.True(runner.ScenePosition > paused);
        Assert.Equal(1, runner.Events.Count(item => item.Text.Contains("Voice scheduled at")));

        runner.Stop();
        Assert.False(host.Audio.VoicePlaying);
        Assert.Equal(0, runner.TakeSeconds);
    }

    [Fact]
    public void CueEndRestoresFilmLevel()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = null;
        project.Scenes[0].Cues = [new VoiceCue(0, 24)];
        var (runner, host, clock) = CreateRunner(project);

        runner.BeginRun(false);
        runner.Tick();
        Assert.Equal(project.FilmLevel * project.DuckLevel, host.Media.FilmVolume, 6);

        clock.Now = 2;
        runner.Tick();
        Assert.False(host.Audio.VoicePlaying);
        Assert.Equal(project.FilmLevel, host.Media.FilmVolume, 6);
    }

    [Fact]
    public void ConsentGateMutesFilmAndDeclineRestoresIt()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = null;
        project.Scenes[0].Cues = [new VoiceCue(0, 144)];
        project.Scenes[0].Capture!.GateFrame = 24;
        var (runner, host, clock) = CreateRunner(project);

        runner.BeginRun(false);
        runner.Tick();
        Assert.Equal(project.FilmLevel * project.DuckLevel, host.Media.FilmVolume, 6);

        clock.Now = 1;
        runner.Tick();
        Assert.Equal(ShowState.Gate, runner.State);
        Assert.False(host.Audio.VoicePlaying);
        Assert.Equal(0, host.Media.FilmVolume, 6);

        runner.DeclineAtGate();
        clock.Now = 1.05;
        runner.Tick();
        Assert.Equal(ShowState.Playing, runner.State);
        Assert.Equal(project.FilmLevel, host.Media.FilmVolume, 6);
    }

    [Fact]
    public void AutomaticCaptureNeedsConsentAndCompletes()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = null;
        project.Scenes[0].Cues = [];
        project.Scenes[0].Capture = new CaptureCue(CaptureTrigger.Automatic, 0, 1);
        var (runner, host, clock) = CreateRunner(project);

        Assert.False(runner.Start());
        Assert.True(runner.NeedsConsent);
        Assert.Equal(ShowState.Idle, runner.State);

        Assert.True(runner.Start(true));
        runner.Tick();
        Assert.Equal(ShowState.Recording, runner.State);
        Assert.Equal(1, host.Audio.BeginCaptureSeconds);

        clock.Now = 1.2;
        runner.Tick();
        Assert.Equal(ShowState.Playing, runner.State);
        Assert.Equal(7.2, runner.TakeSeconds);

        runner.Stop();
        Assert.Equal(0, runner.TakeSeconds);
    }

    [Fact]
    public void DeclinedAutomaticCaptureContinuesWithoutVoice()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = null;
        project.Scenes[0].Cues = [];
        project.Scenes[0].Capture = new CaptureCue(CaptureTrigger.Automatic, 0, 1);
        var (runner, host, clock) = CreateRunner(project);

        runner.BeginRun(false);
        runner.Tick();
        Assert.Equal(ShowState.Playing, runner.State);
        Assert.Equal(0, host.Audio.BeginCaptureSeconds);

        clock.Now = 1;
        runner.Tick();
        Assert.Equal(0, runner.TakeSeconds);
        Assert.Contains(runner.Events, item => item.Text.Contains("DREAM-00"));
    }

    [Fact]
    public void ExhibitionFailsClosedWhenMediaIsUnavailable()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = "media/missing.mov";
        project.Scenes[0].Cues = [];
        var (runner, host, _) = CreateRunner(project, ShowSetup.Exhibition);

        runner.BeginRun(false);
        Assert.Equal(ShowState.Idle, runner.State);
        Assert.Contains("Scene media is unavailable", runner.Issue);
        Assert.True(host.AudienceOpen);
    }

    [Fact]
    public void ExhibitionAbortsWhenTheAudienceCannotOpen()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = null;
        project.Scenes[0].Cues = [];
        var (runner, host, _) = CreateRunner(project, ShowSetup.Exhibition);
        host.OnOpenAudience = () => runner.Abort("The selected projector is unavailable.");

        Assert.False(runner.Start(true));
        Assert.Equal(ShowState.Idle, runner.State);
        Assert.Contains("projector", runner.Issue);
        Assert.Null(runner.ActiveCue);
    }

    [Fact]
    public void ExhibitionFailsClosedWhenAudienceOpeningThrows()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = null;
        project.Scenes[0].Cues = [];
        var (runner, host, _) = CreateRunner(project, ShowSetup.Exhibition);
        host.OnOpenAudience = () => throw new ShowHostException("Projector placement failed.");

        Assert.False(runner.Start(true));
        Assert.Equal(ShowState.Idle, runner.State);
        Assert.Contains("Projector", runner.Issue);
    }

    [Fact]
    public void PreparationTimeoutFailsClosed()
    {
        var project = Project.CreateStarter();
        project.Scenes[0].Media = "media/movie.mov";
        project.Scenes[0].Cues = [];
        var (runner, host, clock) = CreateRunner(project);
        host.Media.AllPlayable = true;
        host.Media.PrepareStatus = MediaStatus.Preparing;

        runner.BeginRun(false);
        runner.Tick();
        Assert.Equal(ShowState.Preparing, runner.State);

        clock.Now = 11;
        runner.Tick();
        Assert.Equal(ShowState.Idle, runner.State);
        Assert.Contains("timed out", runner.Issue);
    }

    [Fact]
    public void TestTakeReturnsToEditorAndAuditions()
    {
        var project = Project.CreateStarter();
        var cue = new VoiceCue(0, 240) { LoopToFill = true };
        project.Scenes[3].Cues = [cue];
        var (runner, host, _) = CreateRunner(project);

        runner.SelectScene(3);
        runner.RecordTest(manual: true);
        Assert.Equal(ShowState.Recording, runner.State);
        Assert.True(runner.IsManualRecording);
        Assert.Equal(CaptureCue.ManualLimitSeconds, host.Audio.BeginCaptureSeconds);

        runner.FinishRecording();
        Assert.Equal(ShowState.Idle, runner.State);
        Assert.Equal(7.2, runner.TakeSeconds);

        runner.Audition(cue);
        Assert.True(runner.Auditioning);
        Assert.True(host.Audio.VoicePlaying);

        runner.Stop();
        Assert.False(runner.Auditioning);
        Assert.Equal(0, runner.TakeSeconds);
    }

    [Fact]
    public void MutationsOnlyMarkDirtyWhenTheProjectChanges()
    {
        var (runner, _, _) = CreateRunner(Project.CreateStarter());
        var title = runner.Project.Title;

        runner.Mutate(project => project.Title = title);
        Assert.False(runner.Dirty);

        runner.Mutate(project => project.Title = "Edited");
        Assert.True(runner.Dirty);
        runner.Undo();
        Assert.Equal(title, runner.Project.Title);
        runner.Redo();
        Assert.Equal("Edited", runner.Project.Title);
    }

    [Fact]
    public void MachineVoiceAdvanceLayersOverTheAuthoredOffset()
    {
        var project = Project.CreateStarter();
        project.BlackFromFrame = null;
        project.Scenes[0].Media = null;
        project.Scenes[0].Capture = new CaptureCue(CaptureTrigger.Automatic, 0, 1);
        project.Scenes[0].Cues = [new VoiceCue(48, 24)];
        var (runner, host, clock) = CreateRunner(project);

        runner.MachineVoiceAdvanceMs = 100;
        runner.BeginRun(false);
        runner.Tick();

        clock.Now = 1.9;
        runner.Tick();

        Assert.Equal(0, host.Audio.LastDelay, 3);
        Assert.Equal(0, runner.Project.OutputOffsetMs);
        Assert.Equal(100, runner.MachineVoiceAdvanceMs);

        runner.Stop();
        runner.MachineVoiceAdvanceMs = 5_000;
        Assert.Equal(1_000, runner.MachineVoiceAdvanceMs);
        runner.MachineVoiceAdvanceMs = double.NaN;
        Assert.Equal(0, runner.MachineVoiceAdvanceMs);
    }

    private static (ShowRunner Runner, FakeShowHost Host, TestClock Clock) CreateRunner(
        Project project,
        ShowSetup setup = ShowSetup.Rehearsal)
    {
        var host = new FakeShowHost();
        var clock = new TestClock();
        var runner = new ShowRunner(
            project,
            host,
            setup,
            clock.Read,
            blockers: () => [],
            inputUid: "",
            outputUid: "");
        return (runner, host, clock);
    }
}
