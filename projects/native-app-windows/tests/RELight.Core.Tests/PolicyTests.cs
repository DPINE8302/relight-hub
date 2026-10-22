namespace RELight.Core.Tests;

public sealed class PolicyTests
{
    [Fact]
    public void DuckingIsFilmLevelTimesDuckLevel()
    {
        var project = new Project { FilmLevel = 0.75, DuckLevel = 0.35, VoiceLevel = 0.85 };
        Assert.Equal(0.75, MixPolicy.FilmGain(project, voicePlaying: false), 12);
        Assert.Equal(0.75 * 0.35, MixPolicy.FilmGain(project, voicePlaying: true), 12);
        Assert.Equal(0.85, MixPolicy.VoiceGain(project), 12);
    }

    [Fact]
    public void MixPolicyDoesNotMutateTheProject()
    {
        var project = new Project { FilmLevel = 0.75, DuckLevel = 0.35 };
        _ = MixPolicy.FilmGain(project, voicePlaying: true);
        Assert.Equal(0.75, project.FilmLevel);
        Assert.Equal(0.35, project.DuckLevel);
    }

    [Theory]
    [InlineData(PowerSource.AlternatingCurrent, true, true)]
    [InlineData(PowerSource.AlternatingCurrent, false, false)]
    [InlineData(PowerSource.Battery, true, false)]
    [InlineData(PowerSource.Battery, false, false)]
    [InlineData(PowerSource.Unknown, true, false)]
    [InlineData(PowerSource.Unknown, false, false)]
    public void ExhibitionPowerFailsClosed(PowerSource source, bool known, bool expected)
    {
        Assert.Equal(expected, PowerPolicy.CanRunExhibition(source, known));
    }
}
