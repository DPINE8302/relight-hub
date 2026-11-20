using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using RELight.Core;
using Windows.Storage.Pickers;

namespace RELight.App;

public sealed partial class MainWindow
{
    private CancellationTokenSource? _mediaImportCancellation;

    private async void EditProject_Click(object sender, RoutedEventArgs e)
    {
        if (_studio.Locked)
        {
            return;
        }

        var project = _studio.Project;
        var panel = new StackPanel { Spacing = 10 };
        var title = AddEditorText(panel, "Project name", project.Title);
        var film = AddEditorNumber(panel, "Film volume (0–1)", project.FilmLevel);
        var voice = AddEditorNumber(panel, "Visitor voice volume (0–1)", project.VoiceLevel);
        var duck = AddEditorNumber(panel, "Film volume during voice (0–1)", project.DuckLevel);
        var advance = AddEditorNumber(panel, "Voice advance (ms)", project.OutputOffsetMs);
        var timecode = AddEditorText(panel, "Film starts at (HH:MM:SS:FF)", project.TimecodeStartFrame is long frame
            ? project.Rate.Timecode(frame)
            : "");
        var black = AddEditorText(panel, "End on black at global frame (optional)",
            project.BlackFromFrame?.ToString(CultureInfo.CurrentCulture));

        await ShowEditorAsync("Project settings", panel, project, edited =>
        {
            edited.Title = title.Text.Trim();
            edited.FilmLevel = ReadNumber(film);
            edited.VoiceLevel = ReadNumber(voice);
            edited.DuckLevel = ReadNumber(duck);
            edited.OutputOffsetMs = ReadNumber(advance);
            edited.BlackFromFrame = EmptyAsNull(black.Text) is { } text
                ? long.TryParse(text, out var blackFrame) ? blackFrame : throw new FormatException("Enter a whole frame for the ending black.")
                : null;
            edited.TimecodeStartFrame = EmptyAsNull(timecode.Text) is { } start
                ? project.Rate.TryParseTimecode(start, out var startFrame) ? startFrame : throw new FormatException("Enter a film timecode as HH:MM:SS:FF.")
                : null;
        });
    }

    private async void EditScene_Click(object sender, RoutedEventArgs e)
    {
        if (_studio.Locked)
        {
            return;
        }

        var project = _studio.Project;
        var index = _studio.SelectedScene;
        var scene = _studio.Scene;
        var panel = new StackPanel { Spacing = 10 };
        var name = AddEditorText(panel, "Scene name", scene.Name);
        var thai = AddEditorText(panel, "Thai name", scene.Thai);
        var frames = AddEditorNumber(panel, "Scene length (frames)", scene.Frames);
        var media = AddAssetField(panel, "Film", scene.Media, ".mp4", ".mov", ".m4v");
        var mediaIn = AddEditorNumber(panel, "Film start (source frame)", scene.MediaInFrame);
        var draft = AddEditorCheck(panel, "Draft film", scene.Draft);
        var usb = AddEditorCheck(panel, "Require USB controls for exhibition", project.RequiresPhysicalControls ?? true);

        var capture = scene.Capture ?? new CaptureCue();
        var record = AddEditorCheck(panel, "Record visitor voice in this scene", scene.Capture is not null);
        var trigger = AddEditorChoice(panel, "Recording trigger", new[] { "Paused recording screen", "During film" },
            (int)capture.Trigger);
        var mode = AddEditorChoice(panel, "Recording mode", new[] { "Timed", "Start / Stop" },
            (int)capture.RecordingMode);
        var startMethod = AddEditorChoice(panel, "Start recording with", new[] { "Button", "Countdown", "Narrator" },
            (int)capture.RecordingStartMethod);
        var placement = AddEditorText(panel, "Recording frame (empty means end of scene)",
            (capture.Trigger == CaptureTrigger.Gate ? capture.GateFrame : capture.StartFrame)?.ToString(CultureInfo.CurrentCulture));
        var duration = AddEditorNumber(panel, "Timed recording (seconds)", capture.DurationSeconds);
        var countdown = AddEditorNumber(panel, "Countdown (seconds)", capture.DelaySeconds);
        var narrator = AddAssetField(panel, "Narrator audio", capture.Narrator, ".wav", ".mp3", ".m4a");
        var mute = AddEditorCheck(panel, "Mute narrator audio", capture.NarratorMuted == true);

        var changes = await ShowEditorAsync("Scene settings", panel, project, changed =>
        {
            var edited = changed.Scenes[index];
            edited.Name = name.Text.Trim();
            edited.Thai = thai.Text.Trim();
            edited.Frames = ReadFrame(frames);
            edited.Media = EmptyAsNull(media.Text);
            edited.MediaInFrame = ReadFrame(mediaIn);
            edited.Draft = draft.IsChecked == true;
            var requireControls = usb.IsChecked == true;
            if (requireControls != (project.RequiresPhysicalControls ?? true))
            {
                changed.RequiresPhysicalControls = requireControls;
            }

            if (record.IsChecked != true)
            {
                edited.Capture = null;
                return;
            }

            var gate = trigger.SelectedIndex == (int)CaptureTrigger.Gate;
            var recordingFrame = ReadOptionalFrame(placement);
            edited.Capture = new CaptureCue
            {
                Trigger = (CaptureTrigger)trigger.SelectedIndex,
                Mode = (CaptureMode)mode.SelectedIndex,
                StartMethod = (CaptureStartMethod)startMethod.SelectedIndex,
                GateFrame = gate ? recordingFrame : null,
                StartFrame = gate ? 0 : recordingFrame ?? 0,
                DurationSeconds = ReadNumber(duration),
                CountdownSeconds = checked((int)ReadFrame(countdown)),
                Narrator = EmptyAsNull(narrator.Text),
                NarratorMuted = mute.IsChecked == true
            };
        });

        if (changes && !_studio.Locked)
        {
            await ValidateEditedMediaAsync();
        }
    }

    private async void ImportMedia_Click(object sender, RoutedEventArgs e)
    {
        if (_studio.Locked || _mediaImportCancellation is not null)
        {
            return;
        }

        var project = _studio.Project;
        var sceneId = _studio.Scene.Id;
        using var cancellation = new CancellationTokenSource();
        _mediaImportCancellation = cancellation;
        try
        {
            var options = new StackPanel();
            var type = AddEditorChoice(options, "Import into " + _studio.Scene.Name,
                new[] { "Film · keep scene length", "Film · use full clip length", "Narrator audio" }, 0);
            var dialog = new ContentDialog
            {
                Title = "Import media",
                Content = options,
                XamlRoot = _root.XamlRoot,
                PrimaryButtonText = "Choose file",
                CloseButtonText = "Cancel"
            };
            if (await dialog.ShowAsync() != ContentDialogResult.Primary)
            {
                return;
            }

            var narrator = type.SelectedIndex == 2;
            var picker = new FileOpenPicker();
            var extensions = narrator ? new[] { ".wav", ".mp3", ".m4a" } : new[] { ".mp4", ".mov", ".m4v" };
            foreach (var extension in extensions)
            {
                picker.FileTypeFilter.Add(extension);
            }
            InitializePicker(picker);

            var file = await picker.PickSingleFileAsync();
            if (file is null || _closed)
            {
                return;
            }

            if (!ReferenceEquals(project, _studio.Project) || sceneId != _studio.Scene.Id)
            {
                throw new InvalidOperationException("The scene changed. Open Import media again.");
            }

            _studio.Report("Importing media…");
            await _studio.ImportAssetAsync(file.Path, narrator, fitScene: type.SelectedIndex == 1,
                cancellationToken: cancellation.Token);
            UpdateUi();
        }
        catch (Exception exception)
        {
            if (!_closed)
            {
                _studio.ReportIssue(exception.Message);
            }
        }
        finally
        {
            _mediaImportCancellation = null;
        }
    }

    private async void EditVoice_Click(object sender, RoutedEventArgs e)
    {
        if (_studio.Locked || _studio.SelectedCue is not { } cue)
        {
            return;
        }

        var project = _studio.Project;
        var sceneIndex = _studio.SelectedScene;
        var cueIndex = _studio.Scene.Cues.FindIndex(item => item.Id == cue.Id);
        var panel = new StackPanel { Spacing = 10 };
        var name = AddEditorText(panel, "Cue name", cue.Name);
        var start = AddEditorNumber(panel, "Start (scene frame)", cue.StartFrame);
        var length = AddEditorNumber(panel, "Length (frames)", cue.LengthFrames);
        var trim = AddEditorNumber(panel, "Trim from recording (frames)", cue.SourceInFrame);
        var fadeIn = AddEditorNumber(panel, "Fade in (frames)", cue.FadeInFrames);
        var fadeOut = AddEditorNumber(panel, "Fade out (frames)", cue.FadeOutFrames);
        var boost = AddEditorNumber(panel, "Recording boost (1–400)", cue.BoostLimit);
        var passes = AddEditorNumber(panel, "Repeat count", cue.RepeatCount ?? 1);
        var fill = AddEditorCheck(panel, "Loop to fill the cue", cue.LoopToFill == true);
        var bypass = AddEditorCheck(panel, "Bypass effects", cue.Bypass);
        var builtInPresets = new[] { "Clean", "Echo", "Decay", "Distorted" };
        const string customPresetPrefix = "Project preset · ";
        var choices = new[] { "Current settings" }
            .Concat(builtInPresets)
            .Concat(project.EffectPresets.Keys.OrderBy(key => key, StringComparer.CurrentCulture)
                .Select(key => customPresetPrefix + key)).ToArray();
        var preset = AddEditorChoice(panel, "Apply an effect preset", choices, 0);
        var savePreset = AddEditorText(panel, "Save these effect settings as a new project preset (optional)", null);
        var effects = new Dictionary<EffectParameter, NumberBox>();
        var automation = new Dictionary<EffectParameter, TextBox>();
        var automationPanel = new StackPanel { Spacing = 10 };
        var automationGroup = new Expander { Header = "Automation", Content = automationPanel };
        var automationHint = new TextBlock
        {
            Text = "Enter one frame=value per line, measured from the start of the cue.",
            TextWrapping = TextWrapping.Wrap
        };
        automationPanel.Children.Add(automationHint);

        foreach (var parameter in EffectParameterInfo.All)
        {
            var label = EffectLabel(parameter);
            var range = EffectSettings.Range(parameter);
            effects.Add(parameter, AddEditorNumber(panel, $"{label} ({range.Min} to {range.Max})", cue.Effects[parameter]));
            cue.Automation.TryGetValue(EffectParameterInfo.JsonName(parameter), out var points);
            var text = points is null ? "" : string.Join("\n", points.Select(point =>
                $"{point.Frame}={point.Value:R}"));
            var field = AddEditorText(automationPanel, label, text);
            field.AcceptsReturn = true;
            field.MaxHeight = 100;
            automation.Add(parameter, field);
        }
        panel.Children.Add(automationGroup);

        preset.SelectionChanged += (_, _) =>
        {
            if (preset.SelectedIndex <= 0)
            {
                return;
            }

            var selected = choices[preset.SelectedIndex];
            var values = preset.SelectedIndex <= builtInPresets.Length
                ? EffectSettings.Preset(selected)
                : project.EffectPresets[selected[customPresetPrefix.Length..]];
            foreach (var (parameter, field) in effects)
            {
                field.Value = values[parameter];
            }
        };

        await ShowEditorAsync("Edit voice cue", panel, project, changed =>
        {
            var edited = changed.Scenes[sceneIndex].Cues[cueIndex];
            edited.Name = name.Text.Trim();
            edited.StartFrame = ReadFrame(start);
            edited.LengthFrames = ReadFrame(length);
            edited.SourceInFrame = ReadFrame(trim);
            edited.FadeInFrames = ReadFrame(fadeIn);
            edited.FadeOutFrames = ReadFrame(fadeOut);
            edited.GainBoost = ReadNumber(boost) == cue.BoostLimit ? cue.GainBoost : boost.Value;
            edited.RepeatCount = ReadFrame(passes) == (cue.RepeatCount ?? 1) ? cue.RepeatCount : (long)passes.Value;
            edited.LoopToFill = fill.IsChecked == (cue.LoopToFill == true) ? cue.LoopToFill : fill.IsChecked;
            edited.Bypass = bypass.IsChecked == true;

            foreach (var (parameter, field) in effects)
            {
                var value = ReadNumber(field);
                if (value != cue.Effects[parameter])
                {
                    edited.Effects[parameter] = value;
                }

                var key = EffectParameterInfo.JsonName(parameter);
                cue.Automation.TryGetValue(key, out var original);
                var points = ReadAutomation(automation[parameter], original);
                if (points.Count > 0)
                {
                    edited.Automation[key] = points;
                }
                else
                {
                    edited.Automation.Remove(key);
                }
            }

            if (EmptyAsNull(savePreset.Text) is { } presetName &&
                !changed.EffectPresets.TryAdd(presetName, edited.Effects.Clone()))
            {
                throw new FormatException("A project preset already has that name.");
            }
        });
    }

    private async void SeekScene_Click(object sender, RoutedEventArgs e)
    {
        if (_studio.Locked)
        {
            return;
        }

        var panel = new StackPanel { Spacing = 10 };
        var project = _studio.Project;
        var index = _studio.SelectedScene;
        var timecode = AddEditorText(panel, "Timecode (HH:MM:SS:FF)", _studio.Timecode);
        var dialog = new ContentDialog
        {
            Title = "Go to timecode",
            Content = panel,
            PrimaryButtonText = "Go",
            CloseButtonText = "Cancel",
            XamlRoot = _root.XamlRoot
        };
        if (await dialog.ShowAsync() != ContentDialogResult.Primary || _studio.Locked)
        {
            return;
        }

        try
        {
            if (!ReferenceEquals(project, _studio.Project) || index != _studio.SelectedScene)
            {
                throw new InvalidOperationException("The scene changed. Open Go to timecode again.");
            }

            _studio.Runner.SeekTimecode(timecode.Text);
            UpdateUi();
        }
        catch (Exception exception)
        {
            _studio.ReportIssue(exception.Message);
        }
    }

    private async Task<bool> ShowEditorAsync(string title, StackPanel fields, Project project, Action<Project> edit)
    {
        var error = new TextBlock { TextWrapping = TextWrapping.Wrap, Foreground = new Microsoft.UI.Xaml.Media.SolidColorBrush(Rgb(0xFF8A8A)) };
        var panel = new StackPanel { Spacing = 12, Children = { error, fields } };
        var dialog = new ContentDialog
        {
            Title = title,
            XamlRoot = _root.XamlRoot,
            Content = new ScrollViewer { Content = panel, MaxHeight = 520 },
            PrimaryButtonText = "Apply",
            CloseButtonText = "Cancel"
        };

        dialog.PrimaryButtonClick += (_, args) =>
        {
            try
            {
                if (_studio.Locked || !ReferenceEquals(project, _studio.Project))
                {
                    throw new InvalidOperationException("The project changed. Close this editor and reopen it.");
                }

                var candidate = project.Clone();
                edit(candidate);
                var priorIssues = project.Validation().ToHashSet();
                var issues = candidate.Validation().Where(issue => !priorIssues.Contains(issue)).ToArray();
                if (issues.Length > 0)
                {
                    throw new InvalidOperationException(string.Join("\n", issues));
                }

                _studio.Mutate(edit);
                UpdateUi();
            }
            catch (Exception exception) when (exception is FormatException or OverflowException or InvalidOperationException)
            {
                args.Cancel = true;
                error.Text = exception.Message;
                error.StartBringIntoView();
            }
        };

        return await dialog.ShowAsync() == ContentDialogResult.Primary;
    }

    private TextBox AddAssetField(StackPanel panel, string label, string? value, params string[] extensions)
    {
        var field = AddEditorText(panel, label + " (relative to project folder)", value);
        var root = _studio.RootDirectory;
        var error = new TextBlock { TextWrapping = TextWrapping.Wrap, Visibility = Visibility.Collapsed };
        panel.Children.Add(MakeButton("Choose " + label.ToLowerInvariant(), async (_, _) =>
        {
            try
            {
                error.Visibility = Visibility.Collapsed;
                var picker = new FileOpenPicker();
                foreach (var extension in extensions)
                {
                    picker.FileTypeFilter.Add(extension);
                }

                InitializePicker(picker);
                var file = await picker.PickSingleFileAsync();
                if (file is null)
                {
                    return;
                }

                var relative = Path.GetRelativePath(root, file.Path).Replace('\\', '/');
                if (_studio.Project.AssetPath(relative, root) is null)
                {
                    throw new InvalidOperationException("Choose a file inside the project folder.");
                }

                field.Text = relative;
            }
            catch (Exception exception)
            {
                error.Text = exception.Message;
                error.Visibility = Visibility.Visible;
            }
        }));
        panel.Children.Add(error);
        return field;
    }

    private async void SaveSupportReport_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var picker = new FileSavePicker { SuggestedFileName = "RE-light Support Report" };
            picker.FileTypeChoices.Add("Text report", new[] { ".txt" });
            InitializePicker(picker);
            var file = await picker.PickSaveFileAsync();
            if (file is null)
            {
                return;
            }

            var report = new StringBuilder()
                .AppendLine("RE:Light Native — Windows support report")
                .AppendLine($"Collected {DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss zzz}")
                .AppendLine($"App {typeof(MainWindow).Assembly.GetName().Version}")
                .AppendLine($"Windows {Environment.OSVersion.Version} / {RuntimeInformation.ProcessArchitecture}")
                .AppendLine($"Setup: {_studio.Setup} · {_studio.State} · {_studio.Timecode}")
                .AppendLine($"Project: {_studio.Project.Title}")
                .AppendLine($"Project scenes: {_studio.Project.Scenes.Count}")
                .AppendLine($"USB controls required: {_studio.Project.RequiresPhysicalControls ?? true}")
                .AppendLine($"Connected displays: {_displays.Count}")
                .AppendLine($"Microphones: {_availableInputs.Count} · Speakers: {_availableOutputs.Count}")
                .AppendLine()
                .AppendLine("Readiness");
            foreach (var issue in _studio.Blockers)
            {
                report.AppendLine(issue);
            }

            report.AppendLine().AppendLine("Media");
            var media = _studio.MediaChecks;
            foreach (var scene in _studio.Project.Scenes)
            {
                report.AppendLine($"{scene.Name}: {(media.TryGetValue(scene.Id, out var check) ? check.Detail : "Unchecked")}");
            }

            report.AppendLine().AppendLine("Recent events");
            foreach (var item in _studio.Events.Take(30))
            {
                report.AppendLine($"{item.At:HH:mm:ss}  {item.Text}");
            }

            await File.WriteAllTextAsync(file.Path, report.ToString());
            _studio.Report("Support report saved.");
        }
        catch (Exception exception)
        {
            _studio.ReportIssue(exception.Message);
        }
    }

    private async Task ValidateEditedMediaAsync()
    {
        try
        {
            await _studio.ValidateMediaAsync();
            UpdateUi();
        }
        catch (Exception exception)
        {
            _studio.ReportIssue(exception.Message);
        }
    }

    private static TextBox AddEditorText(StackPanel panel, string label, string? value)
    {
        var field = new TextBox { Header = label, Text = value ?? "" };
        panel.Children.Add(field);
        return field;
    }

    private static NumberBox AddEditorNumber(StackPanel panel, string label, double value)
    {
        var field = new NumberBox { Header = label, Value = value };
        panel.Children.Add(field);
        return field;
    }

    private static CheckBox AddEditorCheck(StackPanel panel, string label, bool value)
    {
        var field = new CheckBox { Content = label, IsChecked = value };
        panel.Children.Add(field);
        return field;
    }

    private static ComboBox AddEditorChoice(StackPanel panel, string label, string[] choices, int index)
    {
        var field = new ComboBox { Header = label, ItemsSource = choices, SelectedIndex = index };
        panel.Children.Add(field);
        return field;
    }

    private static double ReadNumber(NumberBox field) =>
        double.IsFinite(field.Value) ? field.Value : throw new FormatException($"Enter a number for {field.Header}.");

    private static long ReadFrame(NumberBox field)
    {
        var value = ReadNumber(field);
        if (value is < 0 or > 1_000_000 || Math.Truncate(value) != value)
        {
            throw new FormatException($"Enter a whole number from 0 to 1,000,000 for {field.Header}.");
        }

        return (long)value;
    }

    private static long? ReadOptionalFrame(TextBox field)
    {
        if (string.IsNullOrWhiteSpace(field.Text))
        {
            return null;
        }

        return long.TryParse(field.Text, out var value) && value is >= 0 and <= 1_000_000
            ? value
            : throw new FormatException($"Enter a whole number from 0 to 1,000,000 for {field.Header}.");
    }

    private static List<AutomationPoint> ReadAutomation(TextBox field, List<AutomationPoint>? original)
    {
        var points = new List<AutomationPoint>();
        foreach (var line in field.Text.Split(new[] { '\r', '\n' }, StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            var pair = line.Split('=', 2);
            if (pair.Length != 2 || !long.TryParse(pair[0], out var frame) ||
                !double.TryParse(pair[1], NumberStyles.Float, CultureInfo.CurrentCulture, out var value) ||
                !double.IsFinite(value))
            {
                throw new FormatException($"Enter each {field.Header} automation point as frame=value.");
            }

            var prior = original?.FirstOrDefault(point => point.Frame == frame);
            points.Add(prior is null ? new AutomationPoint(frame, value) : new AutomationPoint(frame, value) { Id = prior.Id });
        }
        return points;
    }

    private static string? EmptyAsNull(string value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string EffectLabel(EffectParameter parameter) => parameter switch
    {
        EffectParameter.Level => "Level",
        EffectParameter.LowPassHz => "Low-pass frequency (Hz)",
        EffectParameter.DelayMs => "Delay (ms)",
        EffectParameter.DelayWet => "Delay mix",
        EffectParameter.Feedback => "Delay feedback",
        EffectParameter.ReverbWet => "Reverb mix",
        EffectParameter.Distortion => "Distortion",
        EffectParameter.Pan => "Stereo pan",
        _ => throw new ArgumentOutOfRangeException(nameof(parameter))
    };
}
