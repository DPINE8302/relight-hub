using System.Globalization;
using System.Text;

namespace RELight.Core.Json;

/// <summary>
/// The exact pretty-print shape used by Swift's JSONEncoder with
/// <c>[.prettyPrinted, .sortedKeys]</c>: two-space indents, a space before the
/// colon, escaped forward slashes and a blank line inside empty containers.
/// Object keys are sorted by the caller before they are written.
/// </summary>
internal sealed class JsonTextWriter
{
    private readonly StringBuilder _builder = new();
    private readonly Stack<Scope> _scopes = new();

    private sealed class Scope
    {
        public bool IsObject { get; init; }
        public int Count { get; set; }
        public int MemberIndent { get; init; }
        public bool ExpectingValue { get; set; }
    }

    public override string ToString() => _builder.ToString();

    public void WriteStartObject() => StartContainer(isObject: true, open: '{');

    public void WriteEndObject() => EndContainer(isObject: true, close: '}');

    public void WriteStartArray() => StartContainer(isObject: false, open: '[');

    public void WriteEndArray() => EndContainer(isObject: false, close: ']');

    public void WritePropertyName(string name)
    {
        var scope = CurrentScope();
        if (!scope.IsObject)
        {
            throw new InvalidOperationException("Property names can only be written inside objects.");
        }

        if (scope.ExpectingValue)
        {
            throw new InvalidOperationException("A property value is already pending.");
        }

        scope.Count++;
        if (scope.Count > 1)
        {
            _builder.Append(',');
        }

        NewLineAndIndent(scope);
        AppendQuoted(name);
        _builder.Append(" : ");
        scope.ExpectingValue = true;
    }

    public void WriteString(string value)
    {
        PrepareValue();
        AppendQuoted(value);
    }

    public void WriteBoolean(bool value)
    {
        PrepareValue();
        _builder.Append(value ? "true" : "false");
    }

    public void WriteNumber(long value)
    {
        PrepareValue();
        _builder.Append(value.ToString(CultureInfo.InvariantCulture));
    }

    public void WriteNumber(double value)
    {
        PrepareValue();
        AppendDouble(value);
    }

    private void StartContainer(bool isObject, char open)
    {
        PrepareValue();
        var parentIndent = _scopes.Count == 0 ? 0 : _scopes.Peek().MemberIndent;
        _builder.Append(open);
        _scopes.Push(new Scope
        {
            IsObject = isObject,
            MemberIndent = parentIndent + 1
        });
    }

    private void EndContainer(bool isObject, char close)
    {
        var scope = CurrentScope();
        if (scope.IsObject != isObject)
        {
            throw new InvalidOperationException("Mismatched JSON container.");
        }

        if (scope.ExpectingValue)
        {
            throw new InvalidOperationException("Container closed with a pending property value.");
        }

        _scopes.Pop();

        if (scope.Count == 0)
        {
            _builder.Append('\n');
        }

        _builder.Append('\n');
        AppendIndent(scope.MemberIndent - 1);
        _builder.Append(close);
    }

    private void PrepareValue()
    {
        if (_scopes.Count == 0)
        {
            return;
        }

        var scope = _scopes.Peek();
        if (scope.IsObject)
        {
            if (!scope.ExpectingValue)
            {
                throw new InvalidOperationException("An object value requires a property name.");
            }

            scope.ExpectingValue = false;
            return;
        }

        scope.Count++;
        if (scope.Count > 1)
        {
            _builder.Append(',');
        }

        NewLineAndIndent(scope);
    }

    private Scope CurrentScope() =>
        _scopes.Count > 0
            ? _scopes.Peek()
            : throw new InvalidOperationException("No open JSON container.");

    private void NewLineAndIndent(Scope scope)
    {
        _builder.Append('\n');
        AppendIndent(scope.MemberIndent);
    }

    private void AppendIndent(int level)
    {
        _builder.Append(' ', level * 2);
    }

    private void AppendQuoted(string value)
    {
        _builder.Append('"');
        foreach (var character in value)
        {
            switch (character)
            {
                case '"':
                    _builder.Append("\\\"");
                    break;
                case '\\':
                    _builder.Append("\\\\");
                    break;
                case '/':
                    _builder.Append("\\/");
                    break;
                case '\b':
                    _builder.Append("\\b");
                    break;
                case '\f':
                    _builder.Append("\\f");
                    break;
                case '\n':
                    _builder.Append("\\n");
                    break;
                case '\r':
                    _builder.Append("\\r");
                    break;
                case '\t':
                    _builder.Append("\\t");
                    break;
                default:
                    if (character < 0x20)
                    {
                        _builder.Append("\\u");
                        _builder.Append(((int)character).ToString("x4", CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        _builder.Append(character);
                    }

                    break;
            }
        }

        _builder.Append('"');
    }

    private void AppendDouble(double value)
    {
        if (!double.IsFinite(value))
        {
            throw new RelightJsonException("JSON cannot represent a non-finite number.");
        }

        var text = value.ToString("R", CultureInfo.InvariantCulture);
        if (text.Contains('E', StringComparison.Ordinal))
        {
            text = text.Replace("E", "e", StringComparison.Ordinal);
        }

        _builder.Append(text);
    }
}
