using System.Buffers.Binary;
using System.Text;

namespace RELight.Media;

/// <summary>
/// Reads ISO base media file format metadata (MP4 and QuickTime .mov) without
/// decoding media. This is the cross-platform half of the Phase 0 media spike:
/// it verifies duration, track layout, nominal frame rate and sample counts.
/// </summary>
public static class IsoBmffProbe
{
    public static MediaInfo Probe(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        using var stream = new FileStream(
            path,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            bufferSize: 64 * 1024,
            FileOptions.RandomAccess);
        return Probe(stream, path);
    }

    public static MediaInfo Probe(Stream stream, string path = "")
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead || !stream.CanSeek)
        {
            throw new ArgumentException("The media stream must be readable and seekable.", nameof(stream));
        }

        var movie = new MovieState();
        var length = stream.Length;
        var position = 0L;
        var sawMoov = false;

        while (position + 8 <= length)
        {
            stream.Position = position;
            var size32 = ReadUInt32(stream);
            var type = ReadFourCc(stream);
            long size = size32;
            var headerSize = 8;

            if (size32 == 1)
            {
                size = checked((long)ReadUInt64(stream));
                headerSize = 16;
            }
            else if (size32 == 0)
            {
                size = length - position;
            }

            if (size < headerSize || position + size > length)
            {
                throw new InvalidDataException($"Invalid ISO BMFF box '{type}' at byte {position}.");
            }

            switch (type)
            {
                case "ftyp":
                    ParseFtyp(ReadPayload(stream, position + headerSize, size - headerSize), movie);
                    break;
                case "moov":
                    ParseMoov(ReadPayload(stream, position + headerSize, size - headerSize), movie);
                    sawMoov = true;
                    break;
                case "moof":
                    movie.Fragmented = true;
                    break;
            }

            position += size;
        }

        if (!sawMoov)
        {
            throw new InvalidDataException("No moov atom found; the file is not a readable MP4/QuickTime movie.");
        }

        if (movie.Tracks.Count == 0)
        {
            throw new InvalidDataException("No tracks found in the movie.");
        }

        var movieDuration = movie.Timescale > 0 && movie.Duration > 0
            ? (double)movie.Duration / movie.Timescale
            : 0;

        var videoTrack = movie.Tracks.FirstOrDefault(track => track.Handler == "vide");
        var audioTrack = movie.Tracks.FirstOrDefault(track => track.Handler == "soun");
        var video = videoTrack is null ? null : ToVideoInfo(videoTrack);
        var audio = audioTrack is null ? null : ToAudioInfo(audioTrack);

        if (movieDuration <= 0)
        {
            movieDuration = movie.Tracks
                .Where(track => track.Timescale > 0 && track.Duration > 0)
                .Select(track => (double)track.Duration / track.Timescale)
                .DefaultIfEmpty(0)
                .Max();
        }

        return new MediaInfo(
            path,
            movie.MajorBrand,
            movie.CompatibleBrands,
            movieDuration,
            movie.Fragmented,
            video,
            audio);
    }

    private static VideoTrackInfo ToVideoInfo(TrackState track)
    {
        var trackDuration = track.Timescale > 0 ? (double)track.Duration / track.Timescale : 0;
        var sampleCount = track.SampleCount > 0 ? track.SampleCount : track.SampleSizeCount;
        var frameRate = 0.0;

        if (track.SttsDeltas.Count == 1 && track.Timescale > 0)
        {
            var delta = track.SttsDeltas.First();
            if (delta > 0)
            {
                frameRate = (double)track.Timescale / delta;
            }
        }
        else if (track.Timescale > 0 && track.Duration > 0 && sampleCount > 0)
        {
            frameRate = sampleCount / ((double)track.Duration / track.Timescale);
        }

        var width = track.Width > 0 ? track.Width : checked((int)track.TkhdWidth);
        var height = track.Height > 0 ? track.Height : checked((int)track.TkhdHeight);
        var keyframes = track.HasSyncSampleTable ? track.SyncSampleCount : sampleCount;

        return new VideoTrackInfo(
            track.Codec,
            width,
            height,
            frameRate,
            trackDuration,
            sampleCount,
            keyframes,
            track.SttsDeltas.Count > 1,
            checked((int)Math.Min(track.Timescale, int.MaxValue)));
    }

    private static AudioTrackInfo ToAudioInfo(TrackState track)
    {
        var trackDuration = track.Timescale > 0 ? (double)track.Duration / track.Timescale : 0;
        var sampleCount = track.SampleCount > 0 ? track.SampleCount : track.SampleSizeCount;
        var sampleRate = track.SampleRate > 0 ? track.SampleRate : checked((int)Math.Min(track.Timescale, int.MaxValue));

        return new AudioTrackInfo(
            track.Codec,
            sampleRate,
            track.Channels,
            trackDuration,
            sampleCount,
            checked((int)Math.Min(track.Timescale, int.MaxValue)));
    }

    private static void ParseFtyp(ReadOnlyMemory<byte> payload, MovieState movie)
    {
        var span = payload.Span;
        if (span.Length < 8)
        {
            return;
        }

        movie.MajorBrand = FourCc(span[..4]);
        var compatible = new List<string>();
        for (var offset = 8; offset + 4 <= span.Length; offset += 4)
        {
            compatible.Add(FourCc(span.Slice(offset, 4)));
        }

        movie.CompatibleBrands = compatible;
    }

    private static void ParseMoov(ReadOnlyMemory<byte> payload, MovieState movie)
    {
        foreach (var box in ReadBoxes(payload))
        {
            switch (box.Type)
            {
                case "mvhd":
                    ParseMvhd(box.Payload.Span, movie);
                    break;
                case "trak":
                    movie.Tracks.Add(ParseTrak(box.Payload));
                    break;
                case "mvex":
                    movie.Fragmented = true;
                    break;
            }
        }
    }

    private static TrackState ParseTrak(ReadOnlyMemory<byte> payload)
    {
        var track = new TrackState();
        foreach (var box in ReadBoxes(payload))
        {
            switch (box.Type)
            {
                case "tkhd":
                    ParseTkhd(box.Payload.Span, track);
                    break;
                case "mdia":
                    ParseMdia(box.Payload, track);
                    break;
            }
        }

        return track;
    }

    private static void ParseMdia(ReadOnlyMemory<byte> payload, TrackState track)
    {
        var boxes = ReadBoxes(payload);
        foreach (var box in boxes)
        {
            switch (box.Type)
            {
                case "mdhd":
                    ParseMdhd(box.Payload.Span, track);
                    break;
                case "hdlr":
                    ParseHdlr(box.Payload.Span, track);
                    break;
            }
        }

        foreach (var box in boxes)
        {
            if (box.Type == "minf")
            {
                ParseMinf(box.Payload, track);
            }
        }
    }

    private static void ParseMinf(ReadOnlyMemory<byte> payload, TrackState track)
    {
        foreach (var box in ReadBoxes(payload))
        {
            if (box.Type == "stbl")
            {
                ParseStbl(box.Payload, track);
            }
        }
    }

    private static void ParseStbl(ReadOnlyMemory<byte> payload, TrackState track)
    {
        foreach (var box in ReadBoxes(payload))
        {
            switch (box.Type)
            {
                case "stsd":
                    ParseStsd(box.Payload.Span, track);
                    break;
                case "stts":
                    ParseStts(box.Payload.Span, track);
                    break;
                case "stsz":
                    ParseStsz(box.Payload.Span, track);
                    break;
                case "stz2":
                    ParseStz2(box.Payload.Span, track);
                    break;
                case "stss":
                    ParseStss(box.Payload.Span, track);
                    break;
            }
        }
    }

    private static void ParseMvhd(ReadOnlySpan<byte> payload, MovieState movie)
    {
        var reader = new SpanReader(payload);
        var version = reader.ReadByte();
        reader.Skip(3);
        reader.Skip(version == 1 ? 16 : 8);
        movie.Timescale = reader.ReadUInt32();
        movie.Duration = version == 1 ? reader.ReadUInt64() : reader.ReadUInt32();
    }

    private static void ParseTkhd(ReadOnlySpan<byte> payload, TrackState track)
    {
        var reader = new SpanReader(payload);
        var version = reader.ReadByte();
        reader.Skip(3);
        reader.Skip(version == 1 ? 16 : 8);
        track.Id = reader.ReadUInt32();
        reader.Skip(4);
        track.TkhdDuration = version == 1 ? reader.ReadUInt64() : reader.ReadUInt32();
        reader.Skip(8 + 2 + 2 + 2 + 2 + 36);
        var width = reader.ReadUInt32();
        var height = reader.ReadUInt32();
        track.TkhdWidth = width >> 16;
        track.TkhdHeight = height >> 16;
    }

    private static void ParseMdhd(ReadOnlySpan<byte> payload, TrackState track)
    {
        var reader = new SpanReader(payload);
        var version = reader.ReadByte();
        reader.Skip(3);
        reader.Skip(version == 1 ? 16 : 8);
        track.Timescale = reader.ReadUInt32();
        track.Duration = version == 1 ? reader.ReadUInt64() : reader.ReadUInt32();
    }

    private static void ParseHdlr(ReadOnlySpan<byte> payload, TrackState track)
    {
        var reader = new SpanReader(payload);
        reader.Skip(8);
        track.Handler = reader.ReadFourCc();
    }

    private static void ParseStsd(ReadOnlySpan<byte> payload, TrackState track)
    {
        var reader = new SpanReader(payload);
        reader.Skip(4);
        var entries = reader.ReadUInt32();
        if (entries == 0 || reader.Remaining < 8)
        {
            return;
        }

        var entrySize = reader.ReadUInt32();
        if (entrySize < 8)
        {
            return;
        }

        track.Codec = reader.ReadFourCc();
        if (track.Handler == "vide")
        {
            reader.Skip(6 + 2 + 2 + 2 + 12);
            track.Width = reader.ReadUInt16();
            track.Height = reader.ReadUInt16();
        }
        else if (track.Handler == "soun")
        {
            reader.Skip(6 + 2);
            var entryVersion = reader.ReadUInt16();
            reader.Skip(2 + 4);
            if (entryVersion == 2)
            {
                // QuickTime SoundDescriptionV2: a 64-bit sample rate and a
                // 32-bit channel count live after the legacy header fields.
                reader.Skip(2 + 2 + 2 + 2 + 4 + 4);
                var sampleRate = reader.ReadDouble();
                var channels = reader.ReadUInt32();
                track.SampleRate = (int)Math.Round(sampleRate, MidpointRounding.AwayFromZero);
                track.Channels = checked((ushort)Math.Min(channels, ushort.MaxValue));
            }
            else
            {
                track.Channels = reader.ReadUInt16();
                reader.Skip(2 + 2 + 2);
                var sampleRate = reader.ReadUInt32() >> 16;
                track.SampleRate = (int)sampleRate;
            }
        }
    }

    private static void ParseStts(ReadOnlySpan<byte> payload, TrackState track)
    {
        var reader = new SpanReader(payload);
        reader.Skip(4);
        var entryCount = reader.ReadUInt32();
        var sampleCount = 0L;
        var deltas = new HashSet<uint>();

        for (var index = 0u; index < entryCount; index++)
        {
            var count = reader.ReadUInt32();
            var delta = reader.ReadUInt32();
            sampleCount += count;
            deltas.Add(delta);
        }

        track.SampleCount = sampleCount;
        track.SttsDeltas = deltas;
    }

    private static void ParseStsz(ReadOnlySpan<byte> payload, TrackState track)
    {
        var reader = new SpanReader(payload);
        reader.Skip(4);
        reader.ReadUInt32();
        track.SampleSizeCount = reader.ReadUInt32();
    }

    private static void ParseStz2(ReadOnlySpan<byte> payload, TrackState track)
    {
        var reader = new SpanReader(payload);
        reader.Skip(4 + 3 + 1);
        track.SampleSizeCount = reader.ReadUInt32();
    }

    private static void ParseStss(ReadOnlySpan<byte> payload, TrackState track)
    {
        var reader = new SpanReader(payload);
        reader.Skip(4);
        track.SyncSampleCount = reader.ReadUInt32();
        track.HasSyncSampleTable = true;
    }

    private static List<Box> ReadBoxes(ReadOnlyMemory<byte> payload)
    {
        var boxes = new List<Box>();
        var offset = 0;
        var span = payload.Span;

        while (offset + 8 <= span.Length)
        {
            var size32 = BinaryPrimitives.ReadUInt32BigEndian(span.Slice(offset, 4));
            var type = FourCc(span.Slice(offset + 4, 4));
            long size = size32;
            var headerSize = 8;

            if (size32 == 1)
            {
                if (offset + 16 > span.Length)
                {
                    throw new InvalidDataException($"Truncated large box '{type}'.");
                }

                size = checked((long)BinaryPrimitives.ReadUInt64BigEndian(span.Slice(offset + 8, 8)));
                headerSize = 16;
            }
            else if (size32 == 0)
            {
                size = span.Length - offset;
            }

            if (size < headerSize || offset + size > span.Length)
            {
                throw new InvalidDataException($"Invalid child box '{type}' at offset {offset}.");
            }

            boxes.Add(new Box(type, payload.Slice(offset + headerSize, checked((int)(size - headerSize)))));
            offset += checked((int)size);
        }

        return boxes;
    }

    private static byte[] ReadPayload(Stream stream, long offset, long size)
    {
        if (size > int.MaxValue)
        {
            throw new InvalidDataException("Metadata box is too large to read.");
        }

        var payload = new byte[checked((int)size)];
        stream.Position = offset;
        stream.ReadExactly(payload);
        return payload;
    }

    private static uint ReadUInt32(Stream stream)
    {
        Span<byte> buffer = stackalloc byte[4];
        stream.ReadExactly(buffer);
        return BinaryPrimitives.ReadUInt32BigEndian(buffer);
    }

    private static ulong ReadUInt64(Stream stream)
    {
        Span<byte> buffer = stackalloc byte[8];
        stream.ReadExactly(buffer);
        return BinaryPrimitives.ReadUInt64BigEndian(buffer);
    }

    private static string ReadFourCc(Stream stream)
    {
        Span<byte> buffer = stackalloc byte[4];
        stream.ReadExactly(buffer);
        return FourCc(buffer);
    }

    private static string FourCc(ReadOnlySpan<byte> bytes) => Encoding.ASCII.GetString(bytes);

    private readonly record struct Box(string Type, ReadOnlyMemory<byte> Payload);

    private sealed class MovieState
    {
        public uint Timescale;
        public ulong Duration;
        public string MajorBrand = "";
        public IReadOnlyList<string> CompatibleBrands = [];
        public bool Fragmented;
        public List<TrackState> Tracks { get; } = [];
    }

    private sealed class TrackState
    {
        public uint Id;
        public uint TkhdWidth;
        public uint TkhdHeight;
        public ulong TkhdDuration;
        public string Handler = "";
        public uint Timescale;
        public ulong Duration;
        public string Codec = "";
        public ushort Width;
        public ushort Height;
        public int SampleRate;
        public ushort Channels;
        public long SampleCount;
        public long SampleSizeCount;
        public HashSet<uint> SttsDeltas = [];
        public bool HasSyncSampleTable;
        public long SyncSampleCount;
    }

    private ref struct SpanReader
    {
        private readonly ReadOnlySpan<byte> _data;
        private int _position;

        public SpanReader(ReadOnlySpan<byte> data)
        {
            _data = data;
            _position = 0;
        }

        public int Remaining => _data.Length - _position;

        public byte ReadByte()
        {
            Ensure(1);
            return _data[_position++];
        }

        public ushort ReadUInt16()
        {
            Ensure(2);
            var value = BinaryPrimitives.ReadUInt16BigEndian(_data.Slice(_position, 2));
            _position += 2;
            return value;
        }

        public uint ReadUInt32()
        {
            Ensure(4);
            var value = BinaryPrimitives.ReadUInt32BigEndian(_data.Slice(_position, 4));
            _position += 4;
            return value;
        }

        public ulong ReadUInt64()
        {
            Ensure(8);
            var value = BinaryPrimitives.ReadUInt64BigEndian(_data.Slice(_position, 8));
            _position += 8;
            return value;
        }

        public double ReadDouble()
        {
            var bits = ReadUInt64();
            return BitConverter.Int64BitsToDouble((long)bits);
        }

        public string ReadFourCc()
        {
            Ensure(4);
            var value = FourCc(_data.Slice(_position, 4));
            _position += 4;
            return value;
        }

        public void Skip(int count)
        {
            Ensure(count);
            _position += count;
        }

        private void Ensure(int count)
        {
            if (count < 0 || _position + count > _data.Length)
            {
                throw new InvalidDataException("Truncated ISO BMFF box.");
            }
        }
    }
}
