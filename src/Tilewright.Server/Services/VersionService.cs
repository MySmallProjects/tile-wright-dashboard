using System.Reflection;
using Tilewright.Server.Models;

namespace Tilewright.Server.Services;

public sealed class VersionService
{
    public VersionInfo Current { get; }

    public VersionService()
    {
        var asm = typeof(VersionService).Assembly;
        var meta = asm.GetCustomAttributes<AssemblyMetadataAttribute>()
            .GroupBy(a => a.Key, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.First().Value ?? string.Empty, StringComparer.Ordinal);

        int GetInt(string key, int fallback) =>
            meta.TryGetValue(key, out var raw) && int.TryParse(raw, out var parsed) ? parsed : fallback;

        string GetStr(string key, string fallback) =>
            meta.TryGetValue(key, out var raw) && !string.IsNullOrWhiteSpace(raw) ? raw : fallback;

        var major = GetInt("Major", 0);
        var minor = GetInt("Minor", 1);
        var patch = GetInt("Patch", 0);
        var buildNumber = GetInt("BuildNumber", 0);
        var buildDate = GetStr("BuildDate", DateTimeOffset.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"));
        var configuration = GetStr("BuildConfiguration", "Unknown");
        var machineName = GetStr("BuildMachine", Environment.MachineName);

        var gitCommit = meta.TryGetValue("GitCommit", out var commit) && !string.IsNullOrWhiteSpace(commit)
            ? commit.Trim()
            : null;

        bool? gitDirty = null;
        if (gitCommit is not null && meta.TryGetValue("GitDirty", out var dirtyRaw) && bool.TryParse(dirtyRaw, out var dirty))
        {
            gitDirty = dirty;
        }

        Current = new VersionInfo(
            Version: $"{major}.{minor}.{patch}+{buildNumber}",
            Major: major,
            Minor: minor,
            Patch: patch,
            BuildNumber: buildNumber,
            BuildDate: buildDate,
            Configuration: configuration,
            MachineName: machineName,
            GitCommit: gitCommit,
            GitDirty: gitDirty);
    }
}
