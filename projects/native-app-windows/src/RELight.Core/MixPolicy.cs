namespace RELight.Core;

/// <summary>
/// The mix rules shared by rehearsal and exhibition. Ducking is the authored
/// film level multiplied by the authored duck level; it never changes the
/// project or the machine calibration.
/// </summary>
public static class MixPolicy
{
    public static double FilmGain(Project project, bool voicePlaying)
    {
        ArgumentNullException.ThrowIfNull(project);
        return project.FilmLevel * (voicePlaying ? project.DuckLevel : 1.0);
    }

    public static double VoiceGain(Project project)
    {
        ArgumentNullException.ThrowIfNull(project);
        return project.VoiceLevel;
    }
}
