using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using RELight.Core;
using RELight.Windows;
using Windows.Graphics;
using Windows.Media.Playback;
using Microsoft.UI;
using Windows.UI;

namespace RELight.App;

/// <summary>
/// Borderless audience window. It is deliberately separate from the operator
/// window so the projector can be moved/fullscreened independently.
/// </summary>
public sealed class AudienceWindow
{
    private readonly Window _window;
    private readonly MediaPlayerElement _surface;
    private readonly StackPanel _placeholder;
    private readonly TextBlock _thai;
    private readonly TextBlock _detail;
    private readonly TextBlock _gate;
    private readonly Border _label;
    private readonly Action _closed;
    private string _signature = "";

    public AudienceWindow(MediaPlayer player, DisplayInfo? display, Action closed)
    {
        ArgumentNullException.ThrowIfNull(player);
        _closed = closed;

        _window = new Window
        {
            Title = "RE:Light — Audience"
        };
        _surface = new MediaPlayerElement
        {
            AreTransportControlsEnabled = false,
            Stretch = Stretch.Uniform
        };
        _surface.SetMediaPlayer(player);

        _thai = new TextBlock
        {
            Text = "",
            FontSize = 44,
            FontWeight = Microsoft.UI.Text.FontWeights.Medium,
            Foreground = new SolidColorBrush(Colors.White),
            TextAlignment = TextAlignment.Center
        };
        _detail = new TextBlock
        {
            Text = "SCENE FILM NOT SUPPLIED",
            FontSize = 12,
            FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
            CharacterSpacing = 200,
            Foreground = new SolidColorBrush(Color.FromArgb(255, 160, 160, 160)),
            TextAlignment = TextAlignment.Center
        };
        _placeholder = new StackPanel
        {
            Spacing = 14,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Children = { _thai, _detail }
        };

        _gate = new TextBlock
        {
            Text = "RECORDING IS OPTIONAL\nAsk the participant to consent or continue without voice.",
            FontSize = 20,
            Foreground = new SolidColorBrush(Colors.White),
            TextAlignment = TextAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Visibility = Visibility.Collapsed
        };

        _label = new Border
        {
            Background = new SolidColorBrush(Color.FromArgb(190, 0, 0, 0)),
            CornerRadius = new CornerRadius(10),
            Padding = new Thickness(10, 6, 10, 6),
            Margin = new Thickness(18),
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Top,
            Child = new TextBlock
            {
                Text = "REHEARSAL",
                FontSize = 11,
                FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromArgb(210, 255, 255, 255))
            }
        };

        var grid = new Grid
        {
            Background = new SolidColorBrush(Colors.Black),
            Children = { _surface, _placeholder, _gate, _label }
        };
        _window.Content = grid;
        _window.Closed += (_, _) =>
        {
            _surface.SetMediaPlayer(null);
            _closed();
        };

        if (display is { } target)
        {
            try
            {
                PlaceOnDisplay(target);
            }
            catch (Exception)
            {
                try
                {
                    _window.Close();
                }
                catch (Exception)
                {
                    // The window may not have been activated yet.
                }

                throw;
            }
        }

        _window.Activate();
    }

    public void Update(Scene scene, bool hasVideo, bool black, bool gate, bool recording, bool rehearsal)
    {
        var recordingScreen = recording && scene.Capture?.Trigger == CaptureTrigger.Gate;
        var signature = $"{scene.Id}|{scene.Draft}|{hasVideo}|{black}|{gate}|{recording}|{rehearsal}";
        if (_signature == signature)
        {
            return;
        }

        _signature = signature;
        _label.Visibility = rehearsal && !black && !gate && !recordingScreen
            ? Visibility.Visible
            : Visibility.Collapsed;
        _label.Child = new TextBlock
        {
            Text = scene.Draft ? "REHEARSAL · DRAFT" : "REHEARSAL",
            FontSize = 11,
            FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
            Foreground = new SolidColorBrush(Color.FromArgb(210, 255, 255, 255))
        };

        var captureScreen = gate || recordingScreen;
        _gate.Text = recordingScreen
            ? "RECORDING\nVoice is being captured in memory only."
            : "RECORDING IS OPTIONAL\nAsk the participant to consent or continue without voice.";
        _gate.Visibility = captureScreen ? Visibility.Visible : Visibility.Collapsed;
        if (captureScreen)
        {
            _surface.Visibility = Visibility.Collapsed;
            _placeholder.Visibility = Visibility.Collapsed;
            return;
        }

        if (black)
        {
            _surface.Visibility = Visibility.Collapsed;
            _placeholder.Visibility = Visibility.Collapsed;
            return;
        }

        _surface.Visibility = hasVideo ? Visibility.Visible : Visibility.Collapsed;
        _placeholder.Visibility = hasVideo ? Visibility.Collapsed : Visibility.Visible;
        _thai.Text = scene.Thai;
        _detail.Text = recording ? "RECORDING" : "SCENE FILM NOT SUPPLIED";
    }

    public void Close() => _window.Close();

    private void PlaceOnDisplay(DisplayInfo display)
    {
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(_window);
        var id = Microsoft.UI.Win32Interop.GetWindowIdFromWindow(hwnd);
        var appWindow = AppWindow.GetFromWindowId(id);
        var area = DisplayArea.GetFromPoint(
            new PointInt32(display.Bounds.Left, display.Bounds.Top),
            DisplayAreaFallback.None);
        if (area is null)
        {
            throw new InvalidOperationException("The selected display is no longer available.");
        }

        appWindow.MoveAndResize(area.OuterBounds);
        appWindow.SetPresenter(AppWindowPresenterKind.FullScreen);
    }
}
