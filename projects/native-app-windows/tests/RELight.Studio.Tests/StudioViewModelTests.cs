using RELight.Controls;
using RELight.Core;
using RELight.Show;

namespace RELight.Studio.Tests;

public sealed class StudioViewModelTests : IDisposable
{
    private readonly string _root = Path.Combine(
        Path.GetTempPath(),
        "relight-studio-" + Guid.NewGuid().ToString("N"));

    public StudioViewModelTests()
    {
        Directory.CreateDirectory(_root);
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_root))
            {
                Directory.Delete(_root, recursive: true);
            }
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    [Fact]
    public async Task LoadAsyncReplacesTheProjectAndChecksItsMedia()
    {
        var project = Project.CreateStarter();
        var path = Path.Combine(_root, "experience.relight");
        ProjectFileStore.Save(path, project);

        var (studio, _, _) = CreateStudio(Project.CreateStarter());
        var changes = 0;
        studio.Changed += (_, _) => changes++;

        await studio.LoadAsync(path);

        Assert.Equal(path, studio.ProjectFile);
        Assert.Equal(_root, studio.RootDirectory);
        Assert.Equal(project.Title, studio.Project.Title);
        Assert.Equal(project.Scenes.Count, studio.MediaChecks.Count);
        Assert.Equal(project.Scenes.Count, studio.MissingFilms);
        Assert.All(studio.Project.Scenes, scene => Assert.False(studio.HasVideo(scene)));
        Assert.Contains("Project opened", studio.Note);
        Assert.True(changes > 0);
    }

    [Fact]
    public async Task LoadSaveAndExportAreRefusedWhileARunIsActive()
    {
        var project = SingleSceneProject();
        var (studio, _, _) = CreateStudio(project);
        Assert.True(studio.Start());
        Assert.True(studio.Locked);

        var other = Path.Combine(_root, "other.relight");
        await Assert.ThrowsAsync<InvalidOperationException>(() => studio.LoadAsync(other));
        await Assert.ThrowsAsync<InvalidOperationException>(() => studio.SaveAsync(other));
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => studio.ExportAsync(Path.Combine(_root, "export")));

        studio.Stop();
        Assert.False(studio.Locked);
    }

    [Fact]
    public async Task SaveAsyncWritesTheEditedProjectAndClearsDirty()
    {
        var (studio, _, _) = CreateStudio(SingleSceneProject());
        studio.Mutate(project => project.Title = "Windows twin");
        Assert.True(studio.Dirty);

        var target = Path.Combine(_root, "nested", "saved.relight");
        await studio.SaveAsync(target);

        Assert.False(studio.Dirty);
        Assert.Equal(target, studio.ProjectFile);
        Assert.Equal(Path.GetDirectoryName(target), studio.RootDirectory);
        Assert.Equal("Windows twin", ProjectFileStore.Load(target).Title);
        Assert.Contains("saved", studio.Note);
    }

    [Fact]
    public async Task ExportAsyncStagesAPortableProjectFolder()
    {
        var (studio, _, _) = CreateStudio(SingleSceneProject());
        var destination = Path.Combine(_root, "portable");

        await studio.ExportAsync(destination);

        Assert.True(File.Exists(Path.Combine(destination, "experience.relight")));
        Assert.True(Directory.Exists(Path.Combine(destination, "media")));
        Assert.Contains("exported", studio.Note);
    }

    [Fact]
    public void CueEditingTracksSelectionDirtyStateAndTheRunLock()
    {
        var (studio, _, _) = CreateStudio(SingleSceneProject());
        studio.SelectScene(0);
        studio.Seek(10);

        studio.AddCue();
        Assert.Single(studio.Scene.Cues);
        var cue = Assert.IsType<VoiceCue>(studio.SelectedCue);
        Assert.Equal(10, cue.StartFrame);
        Assert.True(studio.Dirty);

        studio.UpdateSelectedCue(item => item.LengthFrames = 48);
        Assert.Equal(48, studio.SelectedCue!.LengthFrames);

        Assert.True(studio.Start(), string.Join(" | ", studio.Blockers));
        studio.AddCue();
        studio.UpdateSelectedCue(item => item.LengthFrames = 12);
        studio.RemoveSelectedCue();
        Assert.Single(studio.Scene.Cues);
        Assert.Equal(48, studio.Scene.Cues[0].LengthFrames);

        studio.Stop();
        studio.RemoveSelectedCue();
        Assert.Empty(studio.Scene.Cues);
        Assert.Null(studio.SelectedCueId);
    }

    [Fact]
    public void ApplyControlRecordsAndFinishesAtAGate()
    {
        var project = SingleSceneProject();
        project.Scenes[0].Capture = new CaptureCue(CaptureTrigger.Gate, 0, 6)
        {
            GateFrame = 0
        };
        var (studio, host, clock) = CreateStudio(project);

        studio.BeginRun(false);
        studio.Tick();
        Assert.Equal(ShowState.Gate, studio.State);

        Assert.Equal(ControlAction.RecordAtGate, studio.ApplyControl(ControlRole.Record));
        Assert.Equal(ShowState.Recording, studio.State);
        Assert.True(host.Audio.IsCapturing);
        Assert.Equal(ControlAction.None, studio.ApplyControl(ControlRole.Choice));

        clock.Now = 1;
        studio.Tick();
        Assert.Equal(ShowState.Recording, studio.State);
        Assert.Equal(ControlAction.FinishRecording, studio.ApplyControl(ControlRole.Record));
        Assert.Equal(ShowState.Playing, studio.State);
        Assert.Equal(7.2, studio.TakeSeconds);

        Assert.Equal(ControlAction.None, studio.ApplyControl(ControlRole.Record));
        studio.Stop();
    }

    [Fact]
    public void ExhibitionBlockersCombineMediaDraftAndDeviceProblems()
    {
        var project = SingleSceneProject();
        var (studio, _, _) = CreateStudio(
            project,
            setup: ShowSetup.Exhibition,
            blockers: () => ["Microphone not tested"]);

        var blockers = studio.Blockers;
        Assert.Contains("1 scenes need valid film", blockers);
        Assert.Contains("Approve final media for every scene in Edit", blockers);
        Assert.Contains("Microphone not tested", blockers);
        Assert.False(studio.Start());

        studio.Mutate(changed => changed.Scenes[0].Draft = false);
        Assert.DoesNotContain("Approve final media for every scene in Edit", studio.Blockers);

        studio.SetSetup(ShowSetup.Rehearsal);
        Assert.DoesNotContain("1 scenes need valid film", studio.Blockers);
        Assert.Contains("Microphone not tested", studio.Blockers);
    }

    [Fact]
    public void AbortStopsTheRunAndKeepsTheReason()
    {
        var (studio, host, _) = CreateStudio(SingleSceneProject());
        studio.BeginRun(false);
        studio.Tick();
        Assert.NotEqual(ShowState.Idle, studio.State);

        studio.Abort("Production control disconnected");

        Assert.Equal(ShowState.Idle, studio.State);
        Assert.Equal("Production control disconnected", studio.Issue);
        Assert.False(host.Audio.VoicePlaying);
        Assert.Contains(studio.Events, item => item.Text.Contains("Production control disconnected"));
    }

    [Fact]
    public void LocalIssueAndNoteTakePrecedenceUntilDismissed()
    {
        var (studio, _, _) = CreateStudio(SingleSceneProject());
        studio.Report("Checking devices");
        studio.ReportIssue("Speaker test is required");

        Assert.Equal("Speaker test is required", studio.Issue);
        Assert.Equal("Checking devices", studio.Note);

        studio.DismissIssue();
        Assert.Null(studio.Issue);
        Assert.Equal("Checking devices", studio.Note);
    }

    [Fact]
    public void MachineVoiceAdvanceStaysOutOfTheProject()
    {
        var (studio, _, _) = CreateStudio(SingleSceneProject());
        studio.MachineVoiceAdvanceMs = 75;

        Assert.Equal(75, studio.MachineVoiceAdvanceMs);
        Assert.Equal(0, studio.Project.OutputOffsetMs);
        Assert.Equal(0, studio.Runner.Project.OutputOffsetMs);
    }

    private (StudioViewModel Studio, FakeShowHost Host, TestClock Clock) CreateStudio(
        Project project,
        ShowSetup setup = ShowSetup.Rehearsal,
        Func<IReadOnlyList<string>>? blockers = null)
    {
        var host = new FakeShowHost();
        var clock = new TestClock();
        var file = Path.Combine(_root, "studio.relight");
        var studio = new StudioViewModel(
            _root,
            file,
            project,
            host,
            setup,
            blockers,
            clock.Read);
        return (studio, host, clock);
    }

    private static Project SingleSceneProject() => new()
    {
        Title = "Studio test",
        BlackFromFrame = null,
        Scenes =
        [
            new Scene("One", "หนึ่ง", 240)
            {
                Draft = true,
                Capture = new CaptureCue(CaptureTrigger.Gate, 0, 6) { GateFrame = 0 }
            }
        ]
    };
}
