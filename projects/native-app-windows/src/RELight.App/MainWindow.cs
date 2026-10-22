using System.Runtime.InteropServices;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using RELight.Controls;
using RELight.Core;
using RELight.Show;
using RELight.Studio;
using RELight.Windows;
using Windows.Graphics;
using Windows.Storage.Pickers;
using Microsoft.UI;
using Windows.UI;
using FontWeights = Microsoft.UI.Text.FontWeights;
using FontWeight = Windows.UI.Text.FontWeight;

namespace RELight.App;

public sealed class MainWindow
{
    private readonly Window _window;
    private readonly WinUIShowHost _host;
    private readonly StudioViewModel _studio;
    private readonly WindowsHidControlService _controls;
    private readonly Grid _root;
    private readonly DispatcherQueueTimer _timer;
    private readonly MediaPlayerElement _previewSurface;
    private readonly StackPanel _previewPlaceholder;
    private readonly TextBlock _previewThai;
    private readonly TextBlock _previewDetail;
    private readonly TextBlock _previewBadgeText;
    private readonly TextBlock _previewTime;
    private readonly Border _previewBadge;
    private readonly TextBlock _title;
    private readonly TextBlock _state;
    private readonly TextBlock _timecode;
    private readonly TextBlock _power;
    private readonly TextBlock _note;
    private readonly TextBlock _issue;
    private readonly TextBlock _recordingText;
    private readonly TextBlock _recordingSeconds;
    private readonly TextBlock _take;
    private readonly Button _playButton;
    private readonly Button _stopButton;
    private readonly Button _restartButton;
    private readonly Button _nextButton;
    private readonly Button _recordButton;
    private readonly Button _continueButton;
    private readonly Button _finishButton;
    private readonly Button _addCueButton;
    private readonly Button _removeCueButton;
    private readonly Button _undoButton;
    private readonly Button _redoButton;
    private Button _openButton = null!;
    private Button _saveButton = null!;
    private Button _exportButton = null!;
    private Button _devicesButton = null!;
    private readonly ComboBox _setupCombo;
    private readonly ComboBox _speedCombo;
    private readonly ComboBox _cueCombo;
    private readonly StackPanel _sceneRibbon;
    private readonly StackPanel _blockerList;
    private readonly StackPanel _mediaList;
    private readonly StackPanel _eventList;
    private readonly StackPanel _gatePanel;
    private readonly StackPanel _recordingPanel;
    private readonly Grid _meter;
    private readonly Border _meterFill;
    private readonly ScrollViewer _sceneScroll;
    private readonly TextBlock _controlStatus;
    private readonly Button _assignRecordButton;
    private readonly Button _assignChoiceButton;
    private readonly Button _refreshControlsButton;

    private AudienceWindow? _audience;
    private List<DisplayInfo> _displays = [];
    private HashSet<string> _availableInputs = new(StringComparer.Ordinal);
    private HashSet<string> _availableOutputs = new(StringComparer.Ordinal);
    private DateTime _nextTopologyCheck = DateTime.MinValue;
    private string _screenId = "";
    private double _machineVoiceAdvanceMs;
    private string _powerLabel = "POWER";
    private bool _awake;
    private string _sceneSignature = "";
    private string _blockerSignature = "";
    private string _eventSignature = "";
    private string _mediaSignature = "";
    private string _cueSignature = "";
    private bool _updating;
    private bool _closed;
    private bool _allowClose;
    private bool _closeConfirmationOpen;

    public MainWindow()
    {
        var initial = LoadInitialProject();
        var saved = WindowsSettingsStore.Load();
        var calibration = new CalibrationStore(WindowsAppPaths.SupportRoot).Load();
        _controls = new WindowsHidControlService();

        StudioViewModel? studio = null;
        _host = new WinUIShowHost(
            () => studio?.Project ?? initial.Project,
            () => studio?.RootDirectory ?? initial.Root);
        studio = new StudioViewModel(
            initial.Root,
            initial.File,
            initial.Project,
            _host,
            ShowSetup.Rehearsal,
            DeviceBlockers);
        studio.InputUid = saved.InputUid;
        studio.OutputUid = saved.OutputUid;
        studio.MachineVoiceAdvanceMs = calibration.VoiceAdvanceMs;
        _screenId = saved.ScreenId;
        _machineVoiceAdvanceMs = calibration.VoiceAdvanceMs;
        _studio = studio;
        _host.MediaAvailability = scene => _studio.HasVideo(scene);

        _host.BlackChanged += (_, _) => UpdateUi();
        _host.OpenAudienceRequested += (_, _) => OpenAudience();
        _host.CloseAudienceRequested += (_, _) => CloseAudience();

        _window = new Window
        {
            Title = "RE:Light Native"
        };

        _previewSurface = new MediaPlayerElement
        {
            AreTransportControlsEnabled = false,
            Stretch = Stretch.Uniform,
            Visibility = Visibility.Collapsed
        };
        _previewSurface.SetMediaPlayer(_host.PreviewPlayer);

        _previewThai = TextBlock("", 38, FontWeights.Medium, Colors.White);
        _previewThai.TextAlignment = TextAlignment.Center;
        _previewDetail = TextBlock("SCENE FILM NOT SUPPLIED", 12, FontWeights.SemiBold, Rgb(0xA0A0A0));
        _previewDetail.CharacterSpacing = 180;
        _previewDetail.TextAlignment = TextAlignment.Center;
        _previewPlaceholder = new StackPanel
        {
            Spacing = 14,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Children = { _previewThai, _previewDetail }
        };

        _previewBadgeText = TextBlock("REHEARSAL", 11, FontWeights.SemiBold, Rgb(0xEDEDED));
        _previewBadge = new Border
        {
            Background = new SolidColorBrush(Color.FromArgb(210, 16, 16, 20)),
            BorderBrush = new SolidColorBrush(Color.FromArgb(80, 255, 255, 255)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Padding = new Thickness(10, 5, 10, 5),
            Margin = new Thickness(16),
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Top,
            Child = _previewBadgeText
        };
        _previewTime = TextBlock("", 12, FontWeights.SemiBold, Rgb(0xD8D8D8));
        _previewTime.Margin = new Thickness(16);
        _previewTime.HorizontalAlignment = HorizontalAlignment.Right;
        _previewTime.VerticalAlignment = VerticalAlignment.Bottom;

        _title = TextBlock("RE:Light", 25, FontWeights.SemiBold, Colors.White);
        _state = TextBlock("READY", 13, FontWeights.SemiBold, Rgb(0xF5B84B));
        _timecode = TextBlock("00:00:00:00", 12, FontWeights.Normal, Rgb(0x9A9AA4));
        _power = TextBlock("POWER", 10, FontWeights.SemiBold, Rgb(0x7D7D88));
        _note = TextBlock("Project ready.", 12, FontWeights.Normal, Rgb(0x9A9AA4));
        _note.TextWrapping = TextWrapping.Wrap;
        _issue = TextBlock("", 12, FontWeights.SemiBold, Rgb(0xFF8A8A));
        _issue.TextWrapping = TextWrapping.Wrap;
        _issue.HorizontalAlignment = HorizontalAlignment.Right;

        _recordingText = TextBlock("Participant take", 12, FontWeights.SemiBold, Colors.White);
        _recordingSeconds = TextBlock("0.0 s", 22, FontWeights.SemiBold, Rgb(0xFF8A8A));
        _take = TextBlock("No take", 12, FontWeights.Normal, Rgb(0x9A9AA4));

        _sceneRibbon = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8
        };
        _sceneScroll = new ScrollViewer
        {
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
            VerticalScrollBarVisibility = ScrollBarVisibility.Disabled,
            HorizontalScrollMode = ScrollMode.Auto,
            Content = _sceneRibbon
        };

        _blockerList = new StackPanel { Spacing = 6 };
        _mediaList = new StackPanel { Spacing = 6 };
        _eventList = new StackPanel { Spacing = 6 };

        _gatePanel = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 10,
            VerticalAlignment = VerticalAlignment.Center,
            Visibility = Visibility.Collapsed
        };
        _recordingPanel = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 12,
            VerticalAlignment = VerticalAlignment.Center,
            Visibility = Visibility.Collapsed
        };

        _meterFill = new Border
        {
            Width = 0,
            Height = 4,
            HorizontalAlignment = HorizontalAlignment.Left,
            Background = new SolidColorBrush(Rgb(0xF5B84B)),
            CornerRadius = new CornerRadius(2)
        };
        _meter = new Grid
        {
            Width = 150,
            Height = 4,
            Children =
            {
                new Border
                {
                    Background = new SolidColorBrush(Rgb(0x25252C)),
                    CornerRadius = new CornerRadius(2)
                },
                _meterFill
            }
        };

        _setupCombo = new ComboBox { Width = 145 };
        _setupCombo.Items.Add("Rehearsal");
        _setupCombo.Items.Add("Exhibition");
        _setupCombo.SelectedIndex = 0;
        _setupCombo.SelectionChanged += Setup_SelectionChanged;

        _speedCombo = new ComboBox { Width = 82 };
        _speedCombo.Items.Add("1×");
        _speedCombo.Items.Add("2×");
        _speedCombo.Items.Add("4×");
        _speedCombo.SelectedIndex = 0;
        _speedCombo.SelectionChanged += Speed_SelectionChanged;

        _playButton = MakeButton("Start", PlayPause_Click);
        _stopButton = MakeButton("Stop", Stop_Click);
        _restartButton = MakeButton("Restart", Restart_Click);
        _nextButton = MakeButton("Next scene", Next_Click);
        _recordButton = MakeButton("Record", Record_Click);
        _continueButton = MakeButton("Continue without voice", ContinueWithoutVoice_Click);
        _finishButton = MakeButton("Stop & continue", FinishRecording_Click);
        _addCueButton = MakeButton("Add cue", AddCue_Click);
        _removeCueButton = MakeButton("Remove", RemoveCue_Click);
        _undoButton = MakeButton("Undo", (_, _) => { _studio.Undo(); UpdateUi(); });
        _redoButton = MakeButton("Redo", (_, _) => { _studio.Redo(); UpdateUi(); });

        _cueCombo = new ComboBox
        {
            HorizontalAlignment = HorizontalAlignment.Stretch,
            PlaceholderText = "Voice cues"
        };
        _cueCombo.SelectionChanged += Cue_SelectionChanged;

        _controlStatus = TextBlock("USB controls are starting…", 11, FontWeights.Normal, Rgb(0x9A9AA4));
        _controlStatus.TextWrapping = TextWrapping.Wrap;
        _assignRecordButton = MakeButton("Assign Record", (_, _) => BeginControlLearning(ControlRole.Record));
        _assignChoiceButton = MakeButton("Assign Continue", (_, _) => BeginControlLearning(ControlRole.Choice));
        _refreshControlsButton = MakeButton("Refresh", (_, _) =>
        {
            _controls.Refresh();
            UpdateUi();
        });

        _root = BuildUi();
        _window.Content = _root;
        _window.AppWindow.Closing += (sender, args) =>
        {
            if (_allowClose || !_studio.Dirty)
            {
                return;
            }

            args.Cancel = true;
            if (_closeConfirmationOpen)
            {
                return;
            }

            _closeConfirmationOpen = true;
            _ = ConfirmCloseAsync();
        };

        _window.Closed += (_, _) =>
        {
            _closed = true;
            _timer?.Stop();
            SetAwake(false);
            _audience?.Close();
            _controls.Dispose();
            _host.Dispose();
        };

        _controls.InputReceived += Controls_InputReceived;
        _controls.StatusChanged += Controls_StatusChanged;
        _controls.SetProductionMode(_studio.Setup == ShowSetup.Exhibition);

        _studio.SelectScene(0);
        _timer = _window.DispatcherQueue.CreateTimer();
        _timer.Interval = TimeSpan.FromMilliseconds(50);
        _timer.Tick += (_, _) =>
        {
            if (!_closed)
            {
                _studio.Tick();
                if (DateTime.UtcNow >= _nextTopologyCheck)
                {
                    RefreshTopology();
                }

                SetAwake(_studio.Locked);
                UpdateUi();
            }
        };
        _timer.Start();

        TryResizeWindow();
        UpdateUi();
        _ = InitializeAsync();
    }

    public Window Window => _window;

    private Grid BuildUi()
    {
        var root = new Grid
        {
            Background = new SolidColorBrush(Rgb(0x0D0D0F)),
            RequestedTheme = ElementTheme.Dark
        };
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        var header = BuildHeader();
        Grid.SetRow(header, 0);
        root.Children.Add(header);

        var ribbonBorder = new Border
        {
            Background = new SolidColorBrush(Rgb(0x111114)),
            BorderBrush = new SolidColorBrush(Rgb(0x222228)),
            BorderThickness = new Thickness(0, 1, 0, 1),
            Padding = new Thickness(18, 10, 18, 10),
            Child = _sceneScroll
        };
        Grid.SetRow(ribbonBorder, 1);
        root.Children.Add(ribbonBorder);

        var body = BuildBody();
        Grid.SetRow(body, 2);
        root.Children.Add(body);

        var transport = BuildTransport();
        Grid.SetRow(transport, 3);
        root.Children.Add(transport);

        var footer = BuildFooter();
        Grid.SetRow(footer, 4);
        root.Children.Add(footer);

        return root;
    }

    private Grid BuildHeader()
    {
        var grid = new Grid
        {
            Padding = new Thickness(22, 18, 22, 16)
        };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var brand = new StackPanel { Spacing = 3 };
        var eyebrow = TextBlock("RE:LIGHT  NATIVE", 10, FontWeights.SemiBold, Rgb(0xF5B84B));
        eyebrow.CharacterSpacing = 220;
        brand.Children.Add(eyebrow);
        brand.Children.Add(_title);
        var subtitle = TextBlock("The same .relight project. A native Windows show.", 12, FontWeights.Normal, Rgb(0x7F7F8A));
        brand.Children.Add(subtitle);
        grid.Children.Add(brand);

        var status = new StackPanel
        {
            Spacing = 3,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(24, 0, 24, 0)
        };
        status.Children.Add(_state);
        status.Children.Add(_timecode);
        status.Children.Add(_power);
        Grid.SetColumn(status, 1);
        grid.Children.Add(status);

        var actions = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            VerticalAlignment = VerticalAlignment.Center
        };
        actions.Children.Add(_setupCombo);
        _openButton = MakeButton("Open", Open_Click);
        _saveButton = MakeButton("Save", Save_Click);
        _exportButton = MakeButton("Export", Export_Click);
        _devicesButton = MakeButton("Devices", Devices_Click);
        actions.Children.Add(_openButton);
        actions.Children.Add(_saveButton);
        actions.Children.Add(_exportButton);
        actions.Children.Add(_devicesButton);
        Grid.SetColumn(actions, 2);
        grid.Children.Add(actions);

        return grid;
    }

    private Grid BuildBody()
    {
        var body = new Grid
        {
            Margin = new Thickness(18, 14, 18, 0)
        };
        body.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        body.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(340) });

        var previewCard = new Border
        {
            Background = new SolidColorBrush(Colors.Black),
            BorderBrush = new SolidColorBrush(Rgb(0x25252C)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(18),
            Margin = new Thickness(0, 0, 14, 0),
            Child = new Grid
            {
                Children = { _previewSurface, _previewPlaceholder, _previewBadge, _previewTime }
            }
        };
        body.Children.Add(previewCard);

        var side = BuildSidePanel();
        Grid.SetColumn(side, 1);
        body.Children.Add(side);
        return body;
    }

    private Border BuildSidePanel()
    {
        var content = new StackPanel
        {
            Spacing = 18,
            Padding = new Thickness(18)
        };
        content.Children.Add(SectionHeader("Readiness"));
        content.Children.Add(_blockerList);
        content.Children.Add(SectionHeader("Media checks"));
        content.Children.Add(_mediaList);
        var validate = MakeButton("Validate media", ValidateMedia_Click);
        validate.HorizontalAlignment = HorizontalAlignment.Left;
        content.Children.Add(validate);
        content.Children.Add(SectionHeader("Visitor controls"));
        content.Children.Add(_controlStatus);
        var controlRow = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8
        };
        controlRow.Children.Add(_assignRecordButton);
        controlRow.Children.Add(_assignChoiceButton);
        content.Children.Add(controlRow);
        content.Children.Add(_refreshControlsButton);
        content.Children.Add(SectionHeader("Voice cues"));
        var editRow = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8
        };
        editRow.Children.Add(_addCueButton);
        editRow.Children.Add(_removeCueButton);
        content.Children.Add(editRow);
        content.Children.Add(_cueCombo);
        var undoRow = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8
        };
        undoRow.Children.Add(_undoButton);
        undoRow.Children.Add(_redoButton);
        content.Children.Add(undoRow);
        content.Children.Add(SectionHeader("Event log"));
        content.Children.Add(_eventList);

        return new Border
        {
            Background = new SolidColorBrush(Rgb(0x111114)),
            BorderBrush = new SolidColorBrush(Rgb(0x25252C)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(18),
            Child = new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Content = content
            }
        };
    }

    private Border BuildTransport()
    {
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var left = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            VerticalAlignment = VerticalAlignment.Center
        };
        left.Children.Add(_playButton);
        left.Children.Add(_stopButton);
        left.Children.Add(_restartButton);
        left.Children.Add(_nextButton);
        left.Children.Add(_speedCombo);
        grid.Children.Add(left);

        var middle = new Grid { Margin = new Thickness(18, 0, 18, 0) };
        _gatePanel.Children.Add(TextBlock("Recording is optional.", 14, FontWeights.SemiBold, Colors.White));
        _gatePanel.Children.Add(_recordButton);
        _gatePanel.Children.Add(_continueButton);
        _recordingPanel.Children.Add(_recordingText);
        _recordingPanel.Children.Add(_recordingSeconds);
        _recordingPanel.Children.Add(_finishButton);
        middle.Children.Add(_gatePanel);
        middle.Children.Add(_recordingPanel);
        Grid.SetColumn(middle, 1);
        grid.Children.Add(middle);

        var right = new StackPanel
        {
            Spacing = 5,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Center
        };
        right.Children.Add(_meter);
        right.Children.Add(_take);
        Grid.SetColumn(right, 2);
        grid.Children.Add(right);

        return new Border
        {
            Background = new SolidColorBrush(Rgb(0x111114)),
            BorderBrush = new SolidColorBrush(Rgb(0x25252C)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(16),
            Padding = new Thickness(14),
            Margin = new Thickness(18, 14, 18, 12),
            Child = grid
        };
    }

    private Border BuildFooter()
    {
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.Children.Add(_note);
        Grid.SetColumn(_issue, 1);
        grid.Children.Add(_issue);

        return new Border
        {
            BorderBrush = new SolidColorBrush(Rgb(0x222228)),
            BorderThickness = new Thickness(0, 1, 0, 0),
            Padding = new Thickness(18, 9, 18, 10),
            Child = grid
        };
    }

    private async Task InitializeAsync()
    {
        RefreshTopology();

        try
        {
            await _studio.ValidateMediaAsync();
            _studio.SelectScene(0);
            if (!string.IsNullOrWhiteSpace(_studio.OutputUid))
            {
                await _host.SetOutputDeviceAsync(_studio.OutputUid);
            }
        }
        catch (Exception exception)
        {
            _studio.ReportIssue(exception.Message);
        }

        UpdateUi();
    }

    /// <summary>
    /// Prevents display/system sleep while a run, gate, recording or audition is
    /// active. The request is released as soon as the runner unlocks.
    /// </summary>
    private void SetAwake(bool active)
    {
        if (_awake == active)
        {
            return;
        }

        _awake = active;
        WindowsPower.SetRunAwake(active);
    }

    /// <summary>
    /// Refreshes the device topology every two seconds, mirroring the Mac app's
    /// topology timer. A selected device that disappears stops a live run; a
    /// lost projector also closes the audience window. The cached IDs keep the
    /// 50 ms UI tick from enumerating audio endpoints on every repaint.
    /// </summary>
    private void RefreshTopology()
    {
        _nextTopologyCheck = DateTime.UtcNow.AddSeconds(2);
        _powerLabel = PowerLabel();
        var previousDisplays = _displays;
        IReadOnlyList<AudioEndpointInfo>? inputs = null;
        IReadOnlyList<AudioEndpointInfo>? outputs = null;
        IReadOnlyList<DisplayInfo>? displays = null;
        try
        {
            inputs = WindowsAudioCatalog.GetInputs();
            outputs = WindowsAudioCatalog.GetOutputs();
        }
        catch (Exception)
        {
            // Keep the last known sets; a failed enumeration must not look like
            // a disconnect or a silent switch to another device.
        }

        try
        {
            displays = WindowsDisplayCatalog.GetDisplays();
        }
        catch (Exception)
        {
        }

        var audioLost = false;
        if (inputs is not null)
        {
            var current = inputs.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
            audioLost |= _studio.InputUid.Length > 0 &&
                         _availableInputs.Contains(_studio.InputUid) &&
                         !current.Contains(_studio.InputUid);
            _availableInputs = current;
        }

        if (outputs is not null)
        {
            var current = outputs.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
            audioLost |= _studio.OutputUid.Length > 0 &&
                         _availableOutputs.Contains(_studio.OutputUid) &&
                         !current.Contains(_studio.OutputUid);
            _availableOutputs = current;
        }

        var screenLost = false;
        if (displays is not null)
        {
            var current = displays.ToList();
            screenLost = _screenId.Length > 0 &&
                         previousDisplays.Any(item => item.DeviceId == _screenId) &&
                         !current.Any(item => item.DeviceId == _screenId);
            _displays = current;
        }

        if (audioLost)
        {
            _studio.Report("A selected audio device disconnected.");
        }

        if (screenLost)
        {
            CloseAudience();
        }

        var enumerationFailed = inputs is null || outputs is null || displays is null;
        if (_studio.Locked && _studio.Setup == ShowSetup.Exhibition && enumerationFailed)
        {
            if (displays is null)
            {
                CloseAudience();
            }

            _studio.Abort("Could not verify the selected devices. The run stopped safely.");
            return;
        }

        if (_studio.Locked && (audioLost || (screenLost && _studio.Setup == ShowSetup.Exhibition)))
        {
            _studio.Abort("A selected device disconnected. Reconnect it or continue a new rehearsal.");
        }
    }

    private void UpdateUi()
    {
        if (_updating || _closed)
        {
            return;
        }

        _updating = true;
        try
        {
            var state = _studio.State;
            var scene = _studio.Scene;
            var hasVideo = _studio.HasVideo(scene);
            _title.Text = _studio.Project.Title + (_studio.Dirty ? "  *" : "");
            _state.Text = StateLabel(state);
            _state.Foreground = new SolidColorBrush(StateColor(state));
            _timecode.Text = $"{_studio.Timecode}  ·  scene {_studio.SelectedScene + 1}/{_studio.Project.Scenes.Count}";
            _note.Text = _studio.Note;
            _issue.Text = _studio.Issue ?? "";
            _take.Text = _studio.TakeSeconds > 0 ? $"Take {_studio.TakeSeconds:0.0} s" : "No take";
            _meterFill.Width = 150 * Math.Clamp(_studio.Meter, 0, 1);
            _power.Text = _powerLabel;

            if (!Equals(_setupCombo.SelectedIndex, _studio.Setup == ShowSetup.Rehearsal ? 0 : 1))
            {
                _setupCombo.SelectedIndex = _studio.Setup == ShowSetup.Rehearsal ? 0 : 1;
            }

            var speedIndex = _studio.Speed >= 3.9 ? 2 : _studio.Speed >= 1.9 ? 1 : 0;
            if (_speedCombo.SelectedIndex != speedIndex)
            {
                _speedCombo.SelectedIndex = speedIndex;
            }

            var canPlay = state is ShowState.Idle or ShowState.Finished or ShowState.Playing or ShowState.Paused;
            _playButton.IsEnabled = canPlay;
            _playButton.Content = state switch
            {
                ShowState.Playing => "Pause",
                ShowState.Paused => "Resume",
                _ => "Start"
            };
            _stopButton.IsEnabled = state is not (ShowState.Idle or ShowState.Finished);
            _restartButton.IsEnabled = state is ShowState.Playing or ShowState.Paused;
            _nextButton.IsEnabled = _studio.Setup == ShowSetup.Rehearsal &&
                                    state is ShowState.Playing or ShowState.Paused;
            _gatePanel.Visibility = state == ShowState.Gate ? Visibility.Visible : Visibility.Collapsed;
            _recordingPanel.Visibility = state == ShowState.Recording ? Visibility.Visible : Visibility.Collapsed;
            _recordButton.Content = scene.Capture?.Mode == CaptureMode.Manual
                ? "Start manual take"
                : "Start take";
            _recordingText.Text = _studio.IsCapturingTest ? "Test take" : "Participant take";
            _recordingSeconds.Text = $"{_studio.RecordingSeconds:0.0} s";
            _setupCombo.IsEnabled = !_studio.Locked;
            _speedCombo.IsEnabled = !_studio.Locked;
            _openButton.IsEnabled = !_studio.Locked;
            _saveButton.IsEnabled = !_studio.Locked && _studio.Dirty;
            _exportButton.IsEnabled = !_studio.Locked;
            _devicesButton.IsEnabled = !_studio.Locked;
            _addCueButton.IsEnabled = !_studio.Locked;
            _removeCueButton.IsEnabled = !_studio.Locked && _studio.SelectedCueId is not null;
            _undoButton.IsEnabled = !_studio.Locked;
            _redoButton.IsEnabled = !_studio.Locked;
            _cueCombo.IsEnabled = !_studio.Locked;

            UpdatePreview(scene, hasVideo, state);
            UpdateScenes();
            UpdateCues();
            UpdateStatusLists();
            UpdateControlStatus();
            UpdateAudience(scene, hasVideo, state);
        }
        catch (Exception exception)
        {
            _studio.ReportIssue(exception.Message);
        }
        finally
        {
            _updating = false;
        }
    }

    private void UpdatePreview(Scene scene, bool hasVideo, ShowState state)
    {
        var black = _studio.IsBlack || state is ShowState.Idle or ShowState.Finished or ShowState.Preparing;
        var visible = hasVideo && !black;
        _previewSurface.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
        _previewPlaceholder.Visibility = visible ? Visibility.Collapsed : Visibility.Visible;
        _previewBadge.Visibility = black ? Visibility.Collapsed : Visibility.Visible;
        _previewTime.Text = _studio.Timecode;
        _previewBadgeText.Text = _studio.Setup == ShowSetup.Rehearsal
            ? (scene.Draft ? "REHEARSAL  ·  DRAFT" : "REHEARSAL")
            : "EXHIBITION";

        if (black)
        {
            _previewThai.Text = "";
            _previewDetail.Text = "";
        }
        else
        {
            _previewThai.Text = scene.Thai;
            _previewDetail.Text = hasVideo
                ? (state == ShowState.Recording ? "CAPTURING" : "")
                : "SCENE FILM NOT SUPPLIED";
        }
    }

    private void UpdateScenes()
    {
        var selected = _studio.SelectedScene;
        var signature = string.Join(
            "|",
            _studio.Project.Scenes.Select(scene =>
                $"{scene.Id}:{scene.Name}:{scene.Thai}:{scene.Frames}:{scene.Draft}")) +
            $"|{selected}";
        if (signature == _sceneSignature)
        {
            return;
        }

        _sceneSignature = signature;
        _sceneRibbon.Children.Clear();
        for (var index = 0; index < _studio.Project.Scenes.Count; index++)
        {
            var scene = _studio.Project.Scenes[index];
            var isSelected = index == selected;
            var text = TextBlock(
                $"{index + 1:00}  {scene.Name}",
                12,
                FontWeights.SemiBold,
                isSelected ? Rgb(0x19140A) : Rgb(0xE8E8EE));
            var detail = TextBlock(
                $"{scene.Frames} frames{(scene.Draft ? "  ·  draft" : "")}",
                10,
                FontWeights.Normal,
                isSelected ? Rgb(0x4A3810) : Rgb(0x777782));
            var stack = new StackPanel
            {
                Spacing = 2,
                Children = { text, detail }
            };
            var button = new Button
            {
                Content = stack,
                Width = 178,
                Padding = new Thickness(12, 9, 12, 9),
                CornerRadius = new CornerRadius(12),
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                Background = new SolidColorBrush(isSelected ? Rgb(0xF5B84B) : Rgb(0x1A1A1F)),
                BorderBrush = new SolidColorBrush(isSelected ? Rgb(0xF5B84B) : Rgb(0x2B2B33)),
                BorderThickness = new Thickness(1)
            };
            var indexCopy = index;
            button.Click += (_, _) =>
            {
                if (_studio.Locked)
                {
                    return;
                }

                _studio.SelectScene(indexCopy);
                _studio.Seek(0);
                UpdateUi();
            };
            _sceneRibbon.Children.Add(button);
        }
    }

    private void UpdateCues()
    {
        var cues = _studio.Scene.Cues;
        var signature = $"{_studio.SelectedScene}|{_studio.SelectedCueId}|" +
                        string.Join("|", cues.Select(cue =>
                            $"{cue.Id}:{cue.Name}:{cue.StartFrame}:{cue.LengthFrames}:{cue.Bypass}"));
        if (signature == _cueSignature)
        {
            return;
        }

        _cueSignature = signature;
        _cueCombo.Items.Clear();
        foreach (var cue in cues)
        {
            _cueCombo.Items.Add(new ComboBoxItem
            {
                Content = $"{cue.Name}  ·  {cue.StartFrame}f + {cue.LengthFrames}f",
                Tag = cue.Id
            });
        }

        var selectedIndex = cues.ToList().FindIndex(cue => cue.Id == _studio.SelectedCueId);
        _cueCombo.SelectedIndex = selectedIndex;
        _removeCueButton.IsEnabled = !_studio.Locked && _studio.SelectedCueId is not null;
    }

    private void UpdateStatusLists()
    {
        var blockers = _studio.Blockers;
        var blockerSignature = string.Join("|", blockers);
        if (blockerSignature != _blockerSignature)
        {
            _blockerSignature = blockerSignature;
            _blockerList.Children.Clear();
            if (blockers.Count == 0)
            {
                _blockerList.Children.Add(TextBlock("Ready", 12, FontWeights.Normal, Rgb(0x6AD6A0)));
            }
            else
            {
                foreach (var blocker in blockers.Take(6))
                {
                    _blockerList.Children.Add(TextBlock("•  " + blocker, 12, FontWeights.Normal, Rgb(0xFFB27A)));
                }

                if (blockers.Count > 6)
                {
                    _blockerList.Children.Add(TextBlock(
                        $"+ {blockers.Count - 6} more",
                        11,
                        FontWeights.Normal,
                        Rgb(0x8A8A94)));
                }
            }
        }

        var mediaSignature = string.Join(
            "|",
            _studio.Project.Scenes.Select(scene =>
                $"{scene.Id}:{(_studio.MediaChecks.TryGetValue(scene.Id, out var check) ? check.Valid + check.Detail : "unchecked")}"));
        if (mediaSignature != _mediaSignature)
        {
            _mediaSignature = mediaSignature;
            _mediaList.Children.Clear();
            foreach (var scene in _studio.Project.Scenes)
            {
                var hasCheck = _studio.MediaChecks.TryGetValue(scene.Id, out var check);
                var detail = hasCheck ? check.Detail : "Not checked yet";
                var color = hasCheck && check.Valid ? Rgb(0x6AD6A0) : Rgb(0xFFB27A);
                var line = TextBlock($"{scene.Name}: {detail}", 11, FontWeights.Normal, color);
                line.TextWrapping = TextWrapping.Wrap;
                _mediaList.Children.Add(line);
            }
        }

        var eventSignature = string.Join("|", _studio.Events.Take(8).Select(item => item.Text));
        if (eventSignature != _eventSignature)
        {
            _eventSignature = eventSignature;
            _eventList.Children.Clear();
            if (_studio.Events.Count == 0)
            {
                _eventList.Children.Add(TextBlock("No events yet.", 11, FontWeights.Normal, Rgb(0x777782)));
            }
            else
            {
                foreach (var item in _studio.Events.Take(8))
                {
                    var line = TextBlock(
                        $"{item.At.ToLocalTime():HH:mm:ss}  {item.Text}",
                        10,
                        FontWeights.Normal,
                        Rgb(0x9A9AA4));
                    line.TextWrapping = TextWrapping.Wrap;
                    _eventList.Children.Add(line);
                }
            }
        }
    }

    private void UpdateAudience(Scene scene, bool hasVideo, ShowState state)
    {
        if (_studio.Setup == ShowSetup.Exhibition &&
            state is not (ShowState.Idle or ShowState.Finished) &&
            _audience is null)
        {
            OpenAudience();
        }

        if (_audience is null)
        {
            return;
        }

        var black = _studio.IsBlack || state is ShowState.Idle or ShowState.Finished or ShowState.Preparing;
        _audience.Update(
            scene,
            hasVideo,
            black,
            state == ShowState.Gate,
            state == ShowState.Recording,
            _studio.Setup == ShowSetup.Rehearsal);
    }

    private void OpenAudience()
    {
        if (_audience is not null)
        {
            return;
        }

        if (_displays.Count == 0)
        {
            try
            {
                _displays = WindowsDisplayCatalog.GetDisplays().ToList();
            }
            catch (Exception)
            {
                _displays = [];
            }
        }

        var display = _displays.FirstOrDefault(item => item.DeviceId == _screenId);
        if (display is null)
        {
            var message = string.IsNullOrWhiteSpace(_screenId)
                ? "Select the exhibition projector before opening the audience display."
                : "The selected projector is not available. Reconnect it before opening the audience display.";
            _studio.ReportIssue(message);
            if (_studio.Locked && _studio.Setup == ShowSetup.Exhibition)
            {
                _studio.Abort(message);
            }

            UpdateUi();
            return;
        }

        try
        {
            _audience = new AudienceWindow(_host.AudiencePlayer, display, () => _audience = null);
        }
        catch (Exception exception)
        {
            var message = "The audience display could not be opened: " + exception.Message;
            _studio.ReportIssue(message);
            if (_studio.Locked && _studio.Setup == ShowSetup.Exhibition)
            {
                _studio.Abort(message);
            }

            UpdateUi();
        }
    }

    private void CloseAudience()
    {
        var audience = _audience;
        _audience = null;
        audience?.Close();
    }

    private async void PlayPause_Click(object sender, RoutedEventArgs e)
    {
        if (_studio.State is ShowState.Idle or ShowState.Finished)
        {
            await StartAsync();
            return;
        }

        _studio.TogglePlayback();
        UpdateUi();
    }

    private async Task StartAsync()
    {
        var automatic = _studio.Project.Scenes.Any(scene =>
            scene.Capture?.Trigger == CaptureTrigger.Automatic);
        if (automatic)
        {
            var dialog = new ContentDialog
            {
                Title = "Participant recording",
                Content = new TextBlock
                {
                    Text = "This project records the participant automatically. Voice is kept in memory only and is never saved to the project.",
                    TextWrapping = TextWrapping.Wrap
                },
                PrimaryButtonText = "Allow recording",
                SecondaryButtonText = "Continue without voice",
                CloseButtonText = "Cancel",
                DefaultButton = ContentDialogButton.Primary,
                XamlRoot = _root.XamlRoot
            };
            var result = await dialog.ShowAsync();
            if (result == ContentDialogResult.Primary)
            {
                _studio.Start(true);
            }
            else if (result == ContentDialogResult.Secondary)
            {
                _studio.Start(false);
            }

            if (_studio.State == ShowState.Idle && _studio.Issue is not null)
            {
                await ShowBlockersAsync();
            }
        }
        else if (!_studio.Start())
        {
            await ShowBlockersAsync();
        }

        UpdateUi();
    }

    private void Stop_Click(object sender, RoutedEventArgs e)
    {
        _studio.Stop();
        _studio.SelectScene(_studio.SelectedScene);
        UpdateUi();
    }

    private void Next_Click(object sender, RoutedEventArgs e)
    {
        _studio.NextScene();
        UpdateUi();
    }

    private void Restart_Click(object sender, RoutedEventArgs e)
    {
        _studio.RestartScene();
        UpdateUi();
    }

    private void Record_Click(object sender, RoutedEventArgs e)
    {
        _studio.RecordAtGate();
        UpdateUi();
    }

    private void ContinueWithoutVoice_Click(object sender, RoutedEventArgs e)
    {
        _studio.DeclineAtGate();
        UpdateUi();
    }

    private void FinishRecording_Click(object sender, RoutedEventArgs e)
    {
        _studio.FinishRecording();
        UpdateUi();
    }

    private void AddCue_Click(object sender, RoutedEventArgs e)
    {
        _studio.AddCue();
        UpdateUi();
    }

    private void RemoveCue_Click(object sender, RoutedEventArgs e)
    {
        _studio.RemoveSelectedCue();
        if (_studio.Scene.Cues.Count > 0)
        {
            _studio.SelectedCueId = _studio.Scene.Cues[0].Id;
        }

        UpdateUi();
    }

    private void Cue_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_updating || _cueCombo.SelectedItem is not ComboBoxItem item || item.Tag is not Guid id)
        {
            return;
        }

        _studio.SelectedCueId = id;
        UpdateUi();
    }

    private void Setup_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_updating)
        {
            return;
        }

        if (_studio.Locked)
        {
            UpdateUi();
            return;
        }

        var setup = _setupCombo.SelectedIndex == 1 ? ShowSetup.Exhibition : ShowSetup.Rehearsal;
        _studio.SetSetup(setup);
        _controls.SetProductionMode(setup == ShowSetup.Exhibition);
        UpdateUi();
    }

    private void BeginControlLearning(ControlRole role)
    {
        if (_studio.Locked)
        {
            _studio.Report("Stop the run before changing USB controls.");
            UpdateUi();
            return;
        }

        _controls.BeginLearning(role);
        UpdateUi();
    }

    private void Controls_InputReceived(object? sender, ControlRole role)
    {
        _window.DispatcherQueue.TryEnqueue(() =>
        {
            if (_closed || _studio.Setup != ShowSetup.Exhibition)
            {
                return;
            }

            if (!_controls.IsConnected(role) || !_controls.IsTested(role))
            {
                return;
            }

            _studio.ApplyControl(role);
            UpdateUi();
        });
    }

    private void Controls_StatusChanged(object? sender, EventArgs e)
    {
        _window.DispatcherQueue.TryEnqueue(() =>
        {
            if (_closed)
            {
                return;
            }

            if (_studio.Setup == ShowSetup.Exhibition && _studio.Locked)
            {
                foreach (var role in new[] { ControlRole.Record, ControlRole.Choice })
                {
                    if (_controls.HasBinding(role) && !_controls.IsConnected(role))
                    {
                        _studio.Abort(
                            "An assigned USB control disconnected. Reconnect it and test before restarting.");
                        break;
                    }
                }
            }

            UpdateUi();
        });
    }

    private void UpdateControlStatus()
    {
        var status = _controls.Status;
        var connected = status.Devices
            .Where(device => device.Connected)
            .Select(device => device.Id)
            .ToHashSet(StringComparer.Ordinal);
        var lines = new List<string>();
        if (status.LearningRole is { } learning)
        {
            lines.Add($"Learning {learning.ShortName()}: press and release it twice.");
        }
        else
        {
            lines.Add(status.Message);
        }

        foreach (var role in new[] { ControlRole.Record, ControlRole.Choice })
        {
            var binding = status.Bindings.FirstOrDefault(item => item.ParsedRole == role);
            if (binding is null)
            {
                lines.Add($"{role.ShortName()}: not assigned");
                continue;
            }

            var tested = role == ControlRole.Record ? status.RecordTested : status.ChoiceTested;
            var state = !connected.Contains(binding.DeviceId)
                ? "disconnected"
                : tested
                    ? "tested"
                    : _studio.Setup == ShowSetup.Exhibition
                        ? "press once to test"
                        : "assigned";
            lines.Add($"{role.ShortName()}: {binding.DeviceLabel} · {binding.ElementLabel} ({state})");
        }

        var assignable = status.Devices.Any(device => device.Assignable);
        _assignRecordButton.IsEnabled = assignable && !_studio.Locked;
        _assignChoiceButton.IsEnabled = assignable && !_studio.Locked;
        _assignRecordButton.Content = status.LearningRole == ControlRole.Record
            ? "Press Record twice…"
            : status.Bindings.Any(item => item.ParsedRole == ControlRole.Record)
                ? "Reassign Record"
                : "Assign Record";
        _assignChoiceButton.Content = status.LearningRole == ControlRole.Choice
            ? "Press Continue twice…"
            : status.Bindings.Any(item => item.ParsedRole == ControlRole.Choice)
                ? "Reassign Continue"
                : "Assign Continue";
        _controlStatus.Text = string.Join("\n", lines);

        if (_studio.Setup == ShowSetup.Exhibition && _studio.Locked)
        {
            foreach (var role in new[] { ControlRole.Record, ControlRole.Choice })
            {
                if (_controls.HasBinding(role) && !_controls.IsConnected(role))
                {
                    _studio.Abort($"The assigned {role.ShortName()} USB control disconnected. The run was stopped.");
                    break;
                }
            }
        }
    }

    private void Speed_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_updating)
        {
            return;
        }

        _studio.Speed = _speedCombo.SelectedIndex switch
        {
            2 => 4,
            1 => 2,
            _ => 1
        };
        UpdateUi();
    }

    private async Task ConfirmCloseAsync()
    {
        try
        {
            if (!await ConfirmSaveAsync("closing"))
            {
                return;
            }

            _allowClose = true;
            _window.Close();
        }
        catch (Exception exception)
        {
            _studio.ReportIssue("The window could not close safely: " + exception.Message);
            UpdateUi();
        }
        finally
        {
            _closeConfirmationOpen = false;
        }
    }

    private async Task<bool> SaveDirtyAsync()
    {
        if (!_studio.Dirty)
        {
            return true;
        }

        try
        {
            await _studio.SaveAsync();
            WindowsAppPaths.RememberProject(_studio.ProjectFile);
            UpdateUi();
            return true;
        }
        catch (Exception exception)
        {
            _studio.ReportIssue(exception.Message);
            UpdateUi();
            return false;
        }
    }

    private async Task<bool> ConfirmSaveAsync(string action)
    {
        if (!_studio.Dirty)
        {
            return true;
        }

        if (_root.XamlRoot is null)
        {
            _studio.ReportIssue("The project has unsaved changes, but the window is not ready to ask where to save them.");
            UpdateUi();
            return false;
        }

        var dialog = new ContentDialog
        {
            Title = "Save project changes?",
            Content = new TextBlock
            {
                Text = $"This project has unsaved changes. Save before {action}?",
                TextWrapping = TextWrapping.Wrap
            },
            PrimaryButtonText = "Save",
            SecondaryButtonText = "Discard changes",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = _root.XamlRoot
        };

        ContentDialogResult result;
        try
        {
            result = await dialog.ShowAsync();
        }
        catch (Exception exception)
        {
            _studio.ReportIssue("The save prompt could not be shown: " + exception.Message);
            UpdateUi();
            return false;
        }

        return result switch
        {
            ContentDialogResult.Primary => await SaveDirtyAsync() && !_studio.Dirty,
            ContentDialogResult.Secondary => true,
            _ => false
        };
    }

    /// <summary>
    /// Loads a project from a command-line/file-association path or from a
    /// forwarded second-instance launch. Failures stay in the current project
    /// and are shown in the operator issue line.
    /// </summary>
    public async Task OpenProjectAsync(string? path)
    {
        if (_closed)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(path))
        {
            _window.Activate();
            return;
        }

        _window.Activate();

        if (_studio.Locked)
        {
            _studio.ReportIssue("Stop the run before opening another project.");
            UpdateUi();
            return;
        }

        if (_studio.Dirty && !await ConfirmSaveAsync("opening another project"))
        {
            return;
        }

        try
        {
            await _studio.LoadAsync(path);
            if (_closed)
            {
                return;
            }

            WindowsAppPaths.RememberProject(_studio.ProjectFile);
            _studio.SelectScene(0);
            UpdateUi();
        }
        catch (Exception exception)
        {
            _studio.ReportIssue(exception.Message);
            UpdateUi();
        }

        if (!_closed)
        {
            _window.Activate();
        }
    }

    private async void Open_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var picker = new FileOpenPicker
            {
                SuggestedStartLocation = PickerLocationId.DocumentsLibrary,
                ViewMode = PickerViewMode.List
            };
            picker.FileTypeFilter.Add(".relight");
            InitializePicker(picker);
            var file = await picker.PickSingleFileAsync();
            if (file is null)
            {
                return;
            }

            await OpenProjectAsync(file.Path);
        }
        catch (Exception exception)
        {
            _studio.ReportIssue(exception.Message);
            UpdateUi();
        }
    }

    private async void Save_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            await _studio.SaveAsync();
            WindowsAppPaths.RememberProject(_studio.ProjectFile);
            UpdateUi();
        }
        catch (Exception exception)
        {
            _studio.ReportIssue(exception.Message);
            UpdateUi();
        }
    }

    private async void Export_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (!await SaveDirtyAsync())
            {
                return;
            }

            var picker = new FolderPicker();
            picker.FileTypeFilter.Add("*");
            InitializePicker(picker);
            var parent = await picker.PickSingleFolderAsync();
            if (parent is null)
            {
                return;
            }

            var destination = Path.Combine(
                parent.Path,
                $"RELight Export {DateTime.Now:yyyyMMdd-HHmmss}");
            await _studio.ExportAsync(destination);
            UpdateUi();
        }
        catch (Exception exception)
        {
            _studio.ReportIssue(exception.Message);
            UpdateUi();
        }
    }

    private async void Devices_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var inputs = WindowsAudioCatalog.GetInputs();
            var outputs = WindowsAudioCatalog.GetOutputs();
            var displays = WindowsDisplayCatalog.GetDisplays();
            var panel = new StackPanel { Spacing = 8, MinWidth = 420 };
            panel.Children.Add(TextBlock("Microphone", 12, FontWeights.SemiBold, Colors.White));
            var inputCombo = DeviceCombo(inputs.Select(item => (item.Id, item.Name)));
            panel.Children.Add(inputCombo);
            panel.Children.Add(TextBlock("Speakers", 12, FontWeights.SemiBold, Colors.White));
            var outputCombo = DeviceCombo(outputs.Select(item => (item.Id, item.Name)));
            panel.Children.Add(outputCombo);
            panel.Children.Add(TextBlock("Machine voice advance", 12, FontWeights.SemiBold, Colors.White));
            var advanceBox = new Slider
            {
                Minimum = MachineCalibration.MinimumVoiceAdvanceMs,
                Maximum = MachineCalibration.MaximumVoiceAdvanceMs,
                StepFrequency = 5,
                TickFrequency = 25,
                Value = _machineVoiceAdvanceMs,
                Width = 320,
                HorizontalAlignment = HorizontalAlignment.Left
            };
            var advanceValue = TextBlock(
                $"{_machineVoiceAdvanceMs:0} ms",
                11,
                FontWeights.SemiBold,
                Rgb(0xF5B84B));
            advanceBox.ValueChanged += (_, change) => advanceValue.Text = $"{change.NewValue:0} ms";
            panel.Children.Add(advanceBox);
            panel.Children.Add(advanceValue);
            panel.Children.Add(TextBlock(
                "Milliseconds added on this PC to compensate speaker and projector latency. " +
                "The project's authored Voice advance is never changed.",
                11,
                FontWeights.Normal,
                Rgb(0x9A9AA4)));
            panel.Children.Add(TextBlock("Audience display", 12, FontWeights.SemiBold, Colors.White));
            var displayCombo = new ComboBox { HorizontalAlignment = HorizontalAlignment.Stretch };
            displayCombo.Items.Add(new ComboBoxItem { Content = "No separate display", Tag = "" });
            foreach (var display in displays)
            {
                displayCombo.Items.Add(new ComboBoxItem
                {
                    Content = $"{display.Description}  ·  {display.Bounds.Width}×{display.Bounds.Height}" +
                              (display.IsPrimary ? "  ·  primary" : ""),
                    Tag = display.DeviceId
                });
            }

            panel.Children.Add(displayCombo);
            SelectTag(inputCombo, _studio.InputUid, "Saved microphone · disconnected");
            SelectTag(outputCombo, _studio.OutputUid, "Saved speakers · disconnected");
            SelectTag(displayCombo, _screenId, "Saved display · disconnected");

            var dialog = new ContentDialog
            {
                Title = "Devices",
                Content = new ScrollViewer { Content = panel, MaxHeight = 520 },
                PrimaryButtonText = "Apply",
                CloseButtonText = "Cancel",
                DefaultButton = ContentDialogButton.Primary,
                XamlRoot = _root.XamlRoot
            };
            if (await dialog.ShowAsync() != ContentDialogResult.Primary)
            {
                return;
            }

            var inputUid = TagOf(inputCombo);
            var outputUid = TagOf(outputCombo);
            var screenId = TagOf(displayCombo);
            var advance = Math.Clamp(
                advanceBox.Value,
                MachineCalibration.MinimumVoiceAdvanceMs,
                MachineCalibration.MaximumVoiceAdvanceMs);
            await _host.SetOutputDeviceAsync(outputUid);
            _studio.InputUid = inputUid;
            _studio.OutputUid = outputUid;
            _studio.MachineVoiceAdvanceMs = advance;
            _screenId = screenId;
            _machineVoiceAdvanceMs = advance;
            _displays = displays.ToList();
            _availableInputs = inputs.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
            _availableOutputs = outputs.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
            new CalibrationStore(WindowsAppPaths.SupportRoot).Save(new MachineCalibration(advance));
            WindowsSettingsStore.Save(new DeviceSettings(inputUid, outputUid, screenId));
            _studio.Report("Device assignments and machine calibration saved for this PC.");
            UpdateUi();
        }
        catch (Exception exception)
        {
            _studio.ReportIssue(exception.Message);
            UpdateUi();
        }
    }

    private async void ValidateMedia_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            await _studio.ValidateMediaAsync();
            _studio.Report($"Media checked: {_studio.Project.Scenes.Count - _studio.MissingFilms} of {_studio.Project.Scenes.Count} scenes ready.");
            UpdateUi();
        }
        catch (Exception exception)
        {
            _studio.ReportIssue(exception.Message);
            UpdateUi();
        }
    }

    private async Task ShowBlockersAsync()
    {
        var blockers = _studio.Blockers;
        var text = blockers.Count > 0
            ? string.Join("\n", blockers.Select(item => "•  " + item))
            : _studio.Issue ?? "The run could not start.";
        if (_root.XamlRoot is null)
        {
            return;
        }

        var dialog = new ContentDialog
        {
            Title = "Cannot start yet",
            Content = new ScrollViewer
            {
                MaxHeight = 520,
                Content = new TextBlock
                {
                    Text = text,
                    TextWrapping = TextWrapping.Wrap
                }
            },
            CloseButtonText = "OK",
            XamlRoot = _root.XamlRoot
        };
        await dialog.ShowAsync();
    }

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hwnd);

    private void TryResizeWindow()
    {
        try
        {
            var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(_window);
            var id = Microsoft.UI.Win32Interop.GetWindowIdFromWindow(hwnd);
            var appWindow = AppWindow.GetFromWindowId(id);
            var workArea = DisplayArea.GetFromWindowId(id, DisplayAreaFallback.Primary).WorkArea;
            var dpi = GetDpiForWindow(hwnd);
            var scale = dpi > 0 ? dpi / 96.0 : 1.0;
            appWindow.MoveAndResize(new RectInt32(
                workArea.X,
                workArea.Y,
                Math.Min((int)Math.Round(1440 * scale), workArea.Width),
                Math.Min((int)Math.Round(940 * scale), workArea.Height)));
        }
        catch (Exception)
        {
            // The default window size is still usable.
        }
    }

    private void InitializePicker(object picker)
    {
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(_window);
        WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd);
    }

    private IReadOnlyList<string> DeviceBlockers()
    {
        var issues = new List<string>();
        if (_studio.Setup != ShowSetup.Exhibition)
        {
            return issues;
        }

        if (string.IsNullOrWhiteSpace(_studio.InputUid))
        {
            issues.Add("Select the exhibition microphone");
        }
        else if (!_availableInputs.Contains(_studio.InputUid))
        {
            issues.Add("The selected exhibition microphone is disconnected");
        }

        if (string.IsNullOrWhiteSpace(_studio.OutputUid))
        {
            issues.Add("Select the exhibition speakers");
        }
        else if (!_availableOutputs.Contains(_studio.OutputUid))
        {
            issues.Add("The selected exhibition speakers are disconnected");
        }

        if (!string.IsNullOrWhiteSpace(_studio.OutputUid) && !_host.IsOutputRouted(_studio.OutputUid))
        {
            issues.Add("Selected speakers could not be routed to the video player. Reconnect them and choose the output again.");
        }

        if (string.IsNullOrWhiteSpace(_screenId))
        {
            issues.Add("Select the exhibition projector");
        }
        else if (_displays.Count == 0)
        {
            issues.Add("Could not enumerate displays. Reconnect the projector and refresh.");
        }
        else if (!_displays.Any(item => item.DeviceId == _screenId))
        {
            issues.Add("The selected projector is disconnected");
        }

        WindowsPower.AddExhibitionBlocker(issues);
        var controlStatus = _controls.Status;
        if (!controlStatus.Devices.Any(device => device.Assignable))
        {
            issues.Add("Connect a USB HID encoder with two momentary controls");
        }

        foreach (var role in new[] { ControlRole.Record, ControlRole.Choice })
        {
            if (!_controls.HasBinding(role))
            {
                issues.Add($"Assign the USB {role.ShortName()} control");
            }
            else if (!_controls.IsConnected(role))
            {
                issues.Add($"Reconnect the USB {role.ShortName()} control");
            }
            else if (!_controls.IsTested(role))
            {
                issues.Add($"Press the assigned USB {role.ShortName()} control once to test it");
            }
        }

        return issues;
    }

    private static (Project Project, string Root, string File) LoadInitialProject()
    {
        WindowsAppPaths.EnsureSupportRoot();

        var remembered = WindowsAppPaths.LoadLastProject();
        if (remembered is not null)
        {
            try
            {
                return (ProjectFileStore.Load(remembered), Path.GetDirectoryName(remembered)!, remembered);
            }
            catch (Exception)
            {
                // Fall through to the bundled example or starter project when
                // the remembered project has been moved or damaged.
            }
        }

        try
        {
            var draft = WindowsAppPaths.SeedDraftIfAvailable();
            if (draft is not null)
            {
                return (ProjectFileStore.Load(draft), Path.GetDirectoryName(draft)!, draft);
            }
        }
        catch (Exception)
        {
            // Fall through to the starter project when the bundled example is
            // absent or cannot be copied.
        }

        WindowsAppPaths.EnsureDefaultProjectFolder();
        var file = WindowsAppPaths.DefaultProjectFile;
        if (File.Exists(file))
        {
            return (ProjectFileStore.Load(file), WindowsAppPaths.DefaultProjectFolder, file);
        }

        var project = Project.CreateStarter();
        ProjectFileStore.Save(file, project);
        return (project, WindowsAppPaths.DefaultProjectFolder, file);
    }

    private static string StateLabel(ShowState state) => state switch
    {
        ShowState.Idle => "READY",
        ShowState.Preparing => "PREPARING",
        ShowState.Playing => "RUNNING",
        ShowState.Paused => "PAUSED",
        ShowState.Gate => "WAITING FOR CONSENT",
        ShowState.Recording => "RECORDING",
        ShowState.Finished => "COMPLETE",
        _ => state.ToString().ToUpperInvariant()
    };

    private static Color StateColor(ShowState state) => state switch
    {
        ShowState.Playing => Rgb(0x6AD6A0),
        ShowState.Gate => Rgb(0xF5B84B),
        ShowState.Recording => Rgb(0xFF8A8A),
        ShowState.Paused => Rgb(0xD8D8D8),
        ShowState.Finished => Rgb(0x9A9AA4),
        _ => Rgb(0xF5B84B)
    };

    private static string PowerLabel()
    {
        try
        {
            var power = WindowsPower.Read();
            return power.Known
                ? (power.Source == PowerSource.AlternatingCurrent ? "AC POWER" : "BATTERY")
                : "POWER UNKNOWN";
        }
        catch (Exception)
        {
            return "POWER UNAVAILABLE";
        }
    }

    private static ComboBox DeviceCombo(IEnumerable<(string Id, string Name)> devices)
    {
        var combo = new ComboBox { HorizontalAlignment = HorizontalAlignment.Stretch };
        combo.Items.Add(new ComboBoxItem { Content = "System default", Tag = "" });
        foreach (var (id, name) in devices)
        {
            combo.Items.Add(new ComboBoxItem { Content = name, Tag = id });
        }

        combo.SelectedIndex = 0;
        return combo;
    }

    private static void SelectTag(ComboBox combo, string tag, string missingLabel)
    {
        foreach (var item in combo.Items.OfType<ComboBoxItem>())
        {
            if (string.Equals(item.Tag as string, tag, StringComparison.Ordinal))
            {
                combo.SelectedItem = item;
                return;
            }
        }

        if (string.IsNullOrEmpty(tag))
        {
            combo.SelectedIndex = 0;
            return;
        }

        // Keep the saved identity selectable so applying the dialog does not
        // silently replace a disconnected exhibition device with system default.
        var missing = new ComboBoxItem { Content = missingLabel, Tag = tag };
        combo.Items.Insert(1, missing);
        combo.SelectedItem = missing;
    }

    private static string TagOf(ComboBox combo) =>
        combo.SelectedItem is ComboBoxItem item ? item.Tag as string ?? "" : "";

    private static Button MakeButton(string text, RoutedEventHandler handler)
    {
        var button = new Button
        {
            Content = text,
            Padding = new Thickness(13, 8, 13, 8),
            CornerRadius = new CornerRadius(10),
            Background = new SolidColorBrush(Rgb(0x1B1B21)),
            BorderBrush = new SolidColorBrush(Rgb(0x303039)),
            BorderThickness = new Thickness(1),
            Foreground = new SolidColorBrush(Rgb(0xE8E8EE))
        };
        button.Click += handler;
        return button;
    }

    private static TextBlock SectionHeader(string text)
    {
        var block = TextBlock(text.ToUpperInvariant(), 10, FontWeights.SemiBold, Rgb(0x8A8A94));
        block.CharacterSpacing = 160;
        return block;
    }

    private static TextBlock TextBlock(string text, double size, FontWeight weight, Color color) =>
        new()
        {
            Text = text,
            FontSize = size,
            FontWeight = weight,
            Foreground = new SolidColorBrush(color)
        };

    private static Color Rgb(byte red, byte green, byte blue) =>
        global::Windows.UI.Color.FromArgb(255, red, green, blue);

    private static Color Rgb(uint rgb) =>
        global::Windows.UI.Color.FromArgb(
            255,
            (byte)((rgb >> 16) & 0xFF),
            (byte)((rgb >> 8) & 0xFF),
            (byte)(rgb & 0xFF));
}
