using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;

namespace RELight.App;

internal sealed class App : Application
{
    private readonly SingleInstance _singleInstance;
    private readonly object _activationGate = new();
    private string? _pendingPath;
    private MainWindow? _window;
    private DispatcherQueue? _dispatcher;

    public App(string[] args, SingleInstance singleInstance)
    {
        ArgumentNullException.ThrowIfNull(args);
        ArgumentNullException.ThrowIfNull(singleInstance);
        _singleInstance = singleInstance;
        _singleInstance.ActivationReceived += OnActivationReceived;
        RequestedTheme = ApplicationTheme.Dark;
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();
        _dispatcher = _window.Window.DispatcherQueue;
        _window.Window.Activate();

        string? pending;
        lock (_activationGate)
        {
            pending = _pendingPath;
            _pendingPath = null;
        }

        var project = string.IsNullOrWhiteSpace(pending)
            ? _singleInstance.InitialProject
            : pending;
        if (!string.IsNullOrWhiteSpace(project))
        {
            _ = _window.OpenProjectAsync(project);
        }
    }

    private void OnActivationReceived(object? sender, string? path)
    {
        var dispatcher = _dispatcher;
        if (dispatcher is null)
        {
            lock (_activationGate)
            {
                _pendingPath = path;
            }

            return;
        }

        dispatcher.TryEnqueue(() =>
        {
            var window = _window;
            if (window is not null)
            {
                _ = window.OpenProjectAsync(path);
            }
        });
    }
}
