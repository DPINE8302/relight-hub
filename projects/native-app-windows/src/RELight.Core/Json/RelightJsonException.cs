namespace RELight.Core.Json;

public sealed class RelightJsonException : Exception
{
    public RelightJsonException(string message)
        : base(message)
    {
    }

    public RelightJsonException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
