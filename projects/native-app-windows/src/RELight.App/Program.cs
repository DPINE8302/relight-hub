using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;

namespace RELight.App;

public static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        using var singleInstance = new SingleInstance(args);
        if (!singleInstance.IsPrimary)
        {
            return;
        }

        WinRT.ComWrappersSupport.InitializeComWrappers();
        Application.Start(_ =>
        {
            var context = new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread());
            SynchronizationContext.SetSynchronizationContext(context);
            new App(args, singleInstance);
        });
    }
}
