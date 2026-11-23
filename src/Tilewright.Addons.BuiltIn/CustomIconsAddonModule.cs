using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Tilewright.AddonContracts;

namespace Tilewright.Addons.BuiltIn;

public sealed partial class CustomIconsAddonModule : IAddonModule, IActionHandler, IDynamicIconPackProvider
{
    private const int MaxIconBytes = 2 * 1024 * 1024; // 2 MB per icon
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png", ".svg", ".webp", ".jpg", ".jpeg", ".gif", ".ico"
    };

    [GeneratedRegex("[^a-z0-9_-]+", RegexOptions.Compiled)]
    private static partial Regex NonSlugRegex();

    [GeneratedRegex("[^a-zA-Z0-9_-]", RegexOptions.Compiled)]
    private static partial Regex UnsafeIdRegex();

    public IActionHandler ActionHandler => this;
    public IDynamicIconPackProvider DynamicIconPackProvider => this;

    public Task InitializeAsync(IAddonHostContext host, CancellationToken ct = default)
    {
        Directory.CreateDirectory(Path.Combine(host.DataFolder, "site"));
        Directory.CreateDirectory(Path.Combine(host.DataFolder, "users"));
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<DynamicIconPack>> GetIconPacksAsync(
        AddonUserContext? user,
        IAddonHostContext host,
        CancellationToken ct = default)
    {
        var packs = new List<DynamicIconPack>();

        var siteItems = ReadFolderIcons(Path.Combine(host.DataFolder, "site"), "site");
        if (siteItems.Count > 0)
        {
            packs.Add(new DynamicIconPack("custom-site", "Site Icons", siteItems));
        }

        if (user is not null && !string.IsNullOrWhiteSpace(user.UserId))
        {
            var userDir = GetUserDir(host.DataFolder, user.UserId);
            var userItems = ReadFolderIcons(userDir, "user");
            if (userItems.Count > 0)
            {
                packs.Add(new DynamicIconPack("custom-user", "My Icons", userItems));
            }
        }

        return Task.FromResult<IReadOnlyList<DynamicIconPack>>(packs);
    }

    public string? ResolveAssetPath(string assetPath, AddonUserContext? user, IAddonHostContext host)
    {
        var clean = assetPath.Replace('\\', '/').TrimStart('/');
        if (clean.StartsWith("site/", StringComparison.Ordinal))
        {
            var fileName = clean["site/".Length..];
            if (!IsSafeFileName(fileName)) return null;
            return Path.Combine(host.DataFolder, "site", fileName);
        }

        if (clean.StartsWith("user/", StringComparison.Ordinal) && user is not null && !string.IsNullOrWhiteSpace(user.UserId))
        {
            var fileName = clean["user/".Length..];
            if (!IsSafeFileName(fileName)) return null;
            return Path.Combine(GetUserDir(host.DataFolder, user.UserId), fileName);
        }

        return null;
    }

    public Task<object?> HandleActionAsync(
        string action,
        JsonElement? payload,
        IAddonHostContext host,
        CancellationToken ct = default)
    {
        var user = host.CurrentUser;
        if (user is null || string.IsNullOrWhiteSpace(user.UserId))
        {
            return Task.FromResult<object?>(new { error = "Authentication required." });
        }

        if (string.Equals(action, "list", StringComparison.OrdinalIgnoreCase))
        {
            var site = ReadFolderIconDtos(Path.Combine(host.DataFolder, "site"), "site", host.AddonId);
            var mine = ReadFolderIconDtos(GetUserDir(host.DataFolder, user.UserId), "user", host.AddonId);
            return Task.FromResult<object?>(new { site, user = mine, isAdmin = user.IsAdmin });
        }

        if (string.Equals(action, "upload", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult(HandleUpload(payload, user, host));
        }

        if (string.Equals(action, "delete", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult(HandleDelete(payload, user, host));
        }

        if (string.Equals(action, "delete-all", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult(HandleDeleteAll(payload, user, host));
        }

        return Task.FromResult<object?>(new { error = "Unknown action." });
    }

    private static object? HandleUpload(JsonElement? payload, AddonUserContext user, IAddonHostContext host)
    {
        if (payload is null || payload.Value.ValueKind != JsonValueKind.Object)
        {
            return new { error = "Invalid upload payload." };
        }

        var scope = GetString(payload.Value, "scope") ?? "user";
        var isSite = string.Equals(scope, "site", StringComparison.OrdinalIgnoreCase);
        if (isSite && !user.IsAdmin)
        {
            return new { error = "Admin role required to upload Site Icons." };
        }

        var rawConflictMode = (GetString(payload.Value, "conflictMode") ?? "rename").Trim().ToLowerInvariant();
        var conflictMode = rawConflictMode is "overwrite" or "skip" ? rawConflictMode : "rename";

        if (!payload.Value.TryGetProperty("files", out var filesEl) || filesEl.ValueKind != JsonValueKind.Array)
        {
            return new { error = "No files provided." };
        }

        var targetDir = isSite
            ? Path.Combine(host.DataFolder, "site")
            : GetUserDir(host.DataFolder, user.UserId);
        Directory.CreateDirectory(targetDir);

        var uploaded = new List<string>();
        var added = new List<string>();
        var renamed = new List<string>();
        var overwritten = new List<string>();
        var skipped = new List<string>();
        var errors = new List<string>();

        foreach (var fileEl in filesEl.EnumerateArray())
        {
            var rawName = GetString(fileEl, "fileName") ?? string.Empty;
            var rawBase64 = GetString(fileEl, "dataBase64") ?? string.Empty;

            var ext = Path.GetExtension(rawName).ToLowerInvariant();
            if (!AllowedExtensions.Contains(ext))
            {
                errors.Add($"{rawName}: unsupported file type.");
                continue;
            }

            var stem = Path.GetFileNameWithoutExtension(rawName).Trim().ToLowerInvariant();
            stem = NonSlugRegex().Replace(stem, "-").Trim('-');
            if (string.IsNullOrWhiteSpace(stem))
            {
                stem = $"icon-{Guid.NewGuid():N}"[..13];
            }
            if (stem.Length > 60) stem = stem[..60];

            var commaIdx = rawBase64.IndexOf(',');
            var base64Body = commaIdx >= 0 ? rawBase64[(commaIdx + 1)..] : rawBase64;

            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(base64Body);
            }
            catch (FormatException)
            {
                errors.Add($"{rawName}: invalid file encoding.");
                continue;
            }

            if (bytes.Length == 0 || bytes.Length > MaxIconBytes)
            {
                errors.Add($"{rawName}: must be between 1 byte and 2 MB.");
                continue;
            }

            var fileName = $"{stem}{ext}";
            var fullPath = Path.Combine(targetDir, fileName);
            var exists = File.Exists(fullPath);

            if (exists && conflictMode == "skip")
            {
                skipped.Add(fileName);
                continue;
            }

            var wasRenamed = false;
            var wasOverwritten = false;
            if (exists)
            {
                if (conflictMode == "overwrite")
                {
                    wasOverwritten = true;
                }
                else
                {
                    fileName = GetUniqueFileName(targetDir, stem, ext);
                    fullPath = Path.Combine(targetDir, fileName);
                    wasRenamed = true;
                }
            }

            try
            {
                File.WriteAllBytes(fullPath, bytes);
                uploaded.Add(fileName);
                if (wasOverwritten)
                {
                    overwritten.Add(fileName);
                }
                else if (wasRenamed)
                {
                    renamed.Add(fileName);
                }
                else
                {
                    added.Add(fileName);
                }
            }
            catch (Exception ex)
            {
                host.Logger.LogWarning(ex, "Failed saving custom icon {FileName}", fileName);
                errors.Add($"{rawName}: failed to save.");
            }
        }

        return new { ok = uploaded.Count > 0, uploaded, added, renamed, overwritten, skipped, errors };
    }

    private static string GetUniqueFileName(string targetDir, string stem, string ext)
    {
        var candidate = $"{stem}{ext}";
        if (!File.Exists(Path.Combine(targetDir, candidate)))
        {
            return candidate;
        }

        for (var suffix = 2; suffix < 10_000; suffix++)
        {
            var suffixStr = $"-{suffix}";
            var maxStemLen = Math.Max(1, 60 - suffixStr.Length);
            var trimmedStem = stem.Length > maxStemLen ? stem[..maxStemLen].TrimEnd('-') : stem;
            if (string.IsNullOrEmpty(trimmedStem)) trimmedStem = "icon";
            candidate = $"{trimmedStem}{suffixStr}{ext}";
            if (!File.Exists(Path.Combine(targetDir, candidate)))
            {
                return candidate;
            }
        }

        return $"icon-{Guid.NewGuid():N}"[..13] + ext;
    }

    private static object? HandleDelete(JsonElement? payload, AddonUserContext user, IAddonHostContext host)
    {
        if (payload is null || payload.Value.ValueKind != JsonValueKind.Object)
        {
            return new { error = "Invalid delete payload." };
        }

        var scope = GetString(payload.Value, "scope") ?? "user";
        var isSite = string.Equals(scope, "site", StringComparison.OrdinalIgnoreCase);
        if (isSite && !user.IsAdmin)
        {
            return new { error = "Admin role required to delete Site Icons." };
        }

        var fileName = GetString(payload.Value, "fileName") ?? string.Empty;
        if (!IsSafeFileName(fileName))
        {
            return new { error = "Invalid file name." };
        }

        var targetDir = isSite
            ? Path.Combine(host.DataFolder, "site")
            : GetUserDir(host.DataFolder, user.UserId);
        var fullPath = Path.Combine(targetDir, fileName);
        if (!File.Exists(fullPath))
        {
            return new { error = "Icon not found." };
        }

        File.Delete(fullPath);
        return new { ok = true };
    }

    private static object? HandleDeleteAll(JsonElement? payload, AddonUserContext user, IAddonHostContext host)
    {
        if (payload is null || payload.Value.ValueKind != JsonValueKind.Object)
        {
            return new { error = "Invalid delete-all payload." };
        }

        var scope = GetString(payload.Value, "scope") ?? "user";
        var isSite = string.Equals(scope, "site", StringComparison.OrdinalIgnoreCase);
        if (isSite && !user.IsAdmin)
        {
            return new { error = "Admin role required to delete Site Icons." };
        }

        var targetDir = isSite
            ? Path.Combine(host.DataFolder, "site")
            : GetUserDir(host.DataFolder, user.UserId);
        if (!Directory.Exists(targetDir))
        {
            return new { ok = true, deleted = 0, errors = Array.Empty<string>() };
        }

        var deleted = 0;
        var errors = new List<string>();
        foreach (var file in Directory.GetFiles(targetDir))
        {
            if (!AllowedExtensions.Contains(Path.GetExtension(file))) continue;
            try
            {
                File.Delete(file);
                deleted++;
            }
            catch (Exception ex)
            {
                var fileName = Path.GetFileName(file);
                host.Logger.LogWarning(ex, "Failed deleting custom icon {FileName}", fileName);
                errors.Add($"{fileName}: failed to delete.");
            }
        }

        return new { ok = errors.Count == 0, deleted, errors };
    }

    private static List<DynamicIconItem> ReadFolderIcons(string dir, string routePrefix)
    {
        var list = new List<DynamicIconItem>();
        if (!Directory.Exists(dir)) return list;

        foreach (var file in Directory.GetFiles(dir).OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            var ext = Path.GetExtension(file);
            if (!AllowedExtensions.Contains(ext)) continue;

            var fileName = Path.GetFileName(file);
            var stem = Path.GetFileNameWithoutExtension(fileName);
            var label = stem.Replace('-', ' ').Replace('_', ' ');
            list.Add(new DynamicIconItem(stem, label, $"{routePrefix}/{fileName}"));
        }

        return list;
    }

    private static List<object> ReadFolderIconDtos(string dir, string routePrefix, string addonId)
    {
        var list = new List<object>();
        if (!Directory.Exists(dir)) return list;

        foreach (var file in Directory.GetFiles(dir).OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            var ext = Path.GetExtension(file);
            if (!AllowedExtensions.Contains(ext)) continue;

            var fileName = Path.GetFileName(file);
            var stem = Path.GetFileNameWithoutExtension(fileName);
            var label = stem.Replace('-', ' ').Replace('_', ' ');
            var url = $"/api/addons/{Uri.EscapeDataString(addonId)}/assets/{routePrefix}/{Uri.EscapeDataString(fileName)}";
            list.Add(new { name = stem, label, fileName, url });
        }

        return list;
    }

    private static string GetUserDir(string dataFolder, string userId)
    {
        var safe = UnsafeIdRegex().Replace(userId, string.Empty);
        if (string.IsNullOrWhiteSpace(safe)) safe = "unknown";
        return Path.Combine(dataFolder, "users", safe);
    }

    private static bool IsSafeFileName(string fileName) =>
        !string.IsNullOrWhiteSpace(fileName) &&
        !fileName.Contains('/') &&
        !fileName.Contains('\\') &&
        !fileName.Contains("..", StringComparison.Ordinal) &&
        AllowedExtensions.Contains(Path.GetExtension(fileName));

    private static string? GetString(JsonElement el, string prop) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString()
            : null;
}
