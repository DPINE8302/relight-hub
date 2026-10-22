namespace RELight.Core;

public sealed class Scene : IEquatable<Scene>
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Thai { get; set; } = "";
    public long Frames { get; set; }
    public string? Media { get; set; }
    public long MediaInFrame { get; set; }
    public bool Draft { get; set; } = true;
    public CaptureCue? Capture { get; set; }
    public List<VoiceCue> Cues { get; set; } = [];

    public Scene()
    {
    }

    public Scene(
        string name,
        string thai,
        long frames,
        string? media = null,
        CaptureCue? capture = null,
        IEnumerable<VoiceCue>? cues = null)
    {
        Name = name;
        Thai = thai;
        Frames = frames;
        Media = media;
        Capture = capture;
        if (cues is not null)
        {
            Cues = cues.ToList();
        }
    }

    public Scene Clone() => new()
    {
        Id = Id,
        Name = Name,
        Thai = Thai,
        Frames = Frames,
        Media = Media,
        MediaInFrame = MediaInFrame,
        Draft = Draft,
        Capture = Capture?.Clone(),
        Cues = Cues.Select(cue => cue.Clone()).ToList()
    };

    public bool Equals(Scene? other) =>
        other is not null &&
        Id == other.Id &&
        string.Equals(Name, other.Name, StringComparison.Ordinal) &&
        string.Equals(Thai, other.Thai, StringComparison.Ordinal) &&
        Frames == other.Frames &&
        string.Equals(Media, other.Media, StringComparison.Ordinal) &&
        MediaInFrame == other.MediaInFrame &&
        Draft == other.Draft &&
        Equals(Capture, other.Capture) &&
        Cues.SequenceEqual(other.Cues);

    public override bool Equals(object? obj) => Equals(obj as Scene);

    public override int GetHashCode()
    {
        var hash = new HashCode();
        hash.Add(Id);
        hash.Add(Name, StringComparer.Ordinal);
        hash.Add(Thai, StringComparer.Ordinal);
        hash.Add(Frames);
        hash.Add(Media, StringComparer.Ordinal);
        hash.Add(MediaInFrame);
        hash.Add(Draft);
        hash.Add(Capture);
        foreach (var cue in Cues)
        {
            hash.Add(cue);
        }

        return hash.ToHashCode();
    }
}
