using System.Text.Json.Serialization;

namespace Tilewright.Server.Models;

public sealed record VersionInfo(
    string Version,
    int Major,
    int Minor,
    int Patch,
    int BuildNumber,
    string BuildDate,
    string Configuration,
    string MachineName,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    string? GitCommit,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    bool? GitDirty);
