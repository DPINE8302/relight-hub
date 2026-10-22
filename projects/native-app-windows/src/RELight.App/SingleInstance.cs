using System.Diagnostics;
using System.IO.Pipes;
using System.Text;

namespace RELight.App;

/// <summary>
/// Per-session single-instance gate for the unpackaged Windows app. The first
/// process opens a current-user-only named pipe; later launches forward their
/// optional <c>.relight</c> path to the first window and exit. This avoids
/// opening the same project in two operators and gives file associations a
/// useful target without requiring package identity.
/// </summary>
internal sealed class SingleInstance : IDisposable
{
    private const string MutexName = @"Local\RELightNative.Windows.SingleInstance";
    private static readonly string PipeName =
        $"RELightNative.Windows.Activation.{Process.GetCurrentProcess().SessionId}";
    private readonly Mutex _mutex;
    private readonly CancellationTokenSource _cancellation = new();
    private readonly Task? _listener;
    private readonly object _serverGate = new();
    private readonly object _activationGate = new();
    private EventHandler<string?>? _activationReceived;
    private NamedPipeServerStream? _server;
    private string? _pendingActivation;
    private bool _hasPendingActivation;
    private bool _disposed;

    public SingleInstance(string[] args)
    {
        ArgumentNullException.ThrowIfNull(args);
        InitialProject = ProjectArgument(args);
        _mutex = new Mutex(initiallyOwned: true, MutexName, out var createdNew);
        IsPrimary = createdNew;
        if (!IsPrimary)
        {
            ForwardActivation(InitialProject);
            return;
        }

        _listener = Task.Run(ListenAsync);
    }

    public bool IsPrimary { get; }

    /// <summary>The project path from the first process's command line, if any.</summary>
    public string? InitialProject { get; }

    /// <summary>
    /// Raised on the listener thread when another launch forwards a path (or an
    /// empty string when it merely wants to focus the existing window). An
    /// activation that arrives before the UI subscribes is replayed once.
    /// </summary>
    public event EventHandler<string?>? ActivationReceived
    {
        add
        {
            bool replay;
            string? pending;
            lock (_activationGate)
            {
                _activationReceived += value;
                replay = _hasPendingActivation;
                pending = _pendingActivation;
                _hasPendingActivation = false;
                _pendingActivation = null;
            }

            if (replay)
            {
                value?.Invoke(this, pending);
            }
        }
        remove
        {
            lock (_activationGate)
            {
                _activationReceived -= value;
            }
        }
    }

    public static string? ProjectArgument(IEnumerable<string> args)
    {
        foreach (var argument in args)
        {
            if (!string.IsNullOrWhiteSpace(argument) &&
                !argument.StartsWith('-') &&
                argument.EndsWith(".relight", StringComparison.OrdinalIgnoreCase))
            {
                return argument;
            }
        }

        return null;
    }

    private async Task ListenAsync()
    {
        while (!_cancellation.IsCancellationRequested)
        {
            NamedPipeServerStream server;
            try
            {
                server = new NamedPipeServerStream(
                    PipeName,
                    PipeDirection.In,
                    1,
                    PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                lock (_serverGate)
                {
                    _server = server;
                }
            }
            catch (Exception)
            {
                return;
            }

            try
            {
                await server.WaitForConnectionAsync(_cancellation.Token);
                using var reader = new StreamReader(server, Encoding.UTF8, leaveOpen: true);
                var encoded = await reader.ReadLineAsync(_cancellation.Token);
                if (encoded is not null)
                {
                    var path = Decode(encoded);
                    EventHandler<string?>? handler;
                    lock (_activationGate)
                    {
                        handler = _activationReceived;
                        if (handler is null)
                        {
                            _pendingActivation = path;
                            _hasPendingActivation = true;
                        }
                    }

                    handler?.Invoke(this, path);
                }
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception)
            {
                // A client that disconnects mid-line must not kill the listener.
                await Task.Delay(100).ConfigureAwait(false);
            }
            finally
            {
                lock (_serverGate)
                {
                    if (ReferenceEquals(_server, server))
                    {
                        _server = null;
                    }
                }

                server.Dispose();
            }
        }
    }

    private static void ForwardActivation(string? path)
    {
        for (var attempt = 0; attempt < 20; attempt++)
        {
            try
            {
                using var client = new NamedPipeClientStream(
                    ".",
                    PipeName,
                    PipeDirection.Out,
                    PipeOptions.CurrentUserOnly);
                client.Connect(100);
                using var writer = new StreamWriter(client, new UTF8Encoding(false), leaveOpen: true)
                {
                    AutoFlush = true
                };
                writer.WriteLine(Encode(path));
                return;
            }
            catch (Exception)
            {
                Thread.Sleep(50);
            }
        }
    }

    private static string Encode(string? path) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(path ?? ""));

    private static string? Decode(string encoded)
    {
        try
        {
            var text = Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
            return string.IsNullOrWhiteSpace(text) ? null : text;
        }
        catch (Exception)
        {
            return null;
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _cancellation.Cancel();
        lock (_serverGate)
        {
            _server?.Dispose();
            _server = null;
        }

        try
        {
            _listener?.Wait(TimeSpan.FromMilliseconds(500));
        }
        catch (Exception)
        {
            // Shutdown must not block or throw on a gone pipe.
        }

        _cancellation.Dispose();
        _mutex.Dispose();
    }
}
