using System.IO.Compression;
using System.Text.Json;
using Tilewright.Server.Storage;

namespace Tilewright.Server.Addons;

public sealed record ZipValidationResult(
    bool Success,
    string? Error,
    AddonManifest? Manifest = null,
    bool IsUpgrade = false,
    string? PreviousVersion = null);

public static class AddonPackageValidator
{
    public const long MaxUploadBytes = 25 * 1024 * 1024;    // 25 MB
    public const long MaxExtractedBytes = 50 * 1024 * 1024; // 50 MB

    public static async Task<ZipValidationResult> ValidateAndExtractAsync(
        Stream zipStream,
        long contentLength,
        string stagingDir,
        IReadOnlyDictionary<string, AddonManifest> existingInstalled,
        CancellationToken ct = default)
    {
        if (contentLength <= 0)
        {
            return new ZipValidationResult(false, "Uploaded zip file is empty.");
        }

        if (contentLength > MaxUploadBytes)
        {
            return new ZipValidationResult(false, $"Addon zip exceeds maximum upload size of {MaxUploadBytes / (1024 * 1024)} MB.");
        }

        Directory.CreateDirectory(stagingDir);
        var stagingFull = Path.GetFullPath(stagingDir);
        var stagingPrefix = stagingFull.EndsWith(Path.DirectorySeparatorChar)
            ? stagingFull
            : stagingFull + Path.DirectorySeparatorChar;

        long totalExtracted = 0;

        try
        {
            using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read, leaveOpen: true);

            foreach (var entry in archive.Entries)
            {
                ct.ThrowIfCancellationRequested();

                var entryName = entry.FullName.Replace('\\', '/');

                // Reject absolute paths or rooted entries
                if (string.IsNullOrWhiteSpace(entryName) ||
                    entryName.StartsWith('/') ||
                    Path.IsPathRooted(entryName) ||
                    entryName.Contains(":", StringComparison.Ordinal))
                {
                    return new ZipValidationResult(false, $"Zip-slip rejected: invalid entry path '{entry.FullName}'.");
                }

                // Reject any ".." traversal segment
                var segments = entryName.Split('/', StringSplitOptions.RemoveEmptyEntries);
                if (segments.Any(s => s == ".."))
                {
                    return new ZipValidationResult(false, $"Zip-slip rejected: path traversal in '{entry.FullName}'.");
                }

                var destPath = Path.GetFullPath(Path.Combine(stagingFull, entryName));
                if (!destPath.StartsWith(stagingPrefix, StringComparison.Ordinal))
                {
                    return new ZipValidationResult(false, $"Zip-slip rejected: entry '{entry.FullName}' escapes staging folder.");
                }

                // Directory entry
                if (entryName.EndsWith('/'))
                {
                    Directory.CreateDirectory(destPath);
                    continue;
                }

                var parentDir = Path.GetDirectoryName(destPath);
                if (!string.IsNullOrEmpty(parentDir))
                {
                    Directory.CreateDirectory(parentDir);
                }

                await using var entryStream = entry.Open();
                await using var outStream = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None);

                var buffer = new byte[81920];
                int read;
                while ((read = await entryStream.ReadAsync(buffer, ct)) > 0)
                {
                    totalExtracted += read;
                    if (totalExtracted > MaxExtractedBytes)
                    {
                        return new ZipValidationResult(false, $"Extracted addon exceeds maximum size of {MaxExtractedBytes / (1024 * 1024)} MB.");
                    }
                    await outStream.WriteAsync(buffer.AsMemory(0, read), ct);
                }
            }
        }
        catch (InvalidDataException)
        {
            return new ZipValidationResult(false, "Uploaded file is not a valid zip archive.");
        }

        // Require addon.json at root
        var manifestPath = Path.Combine(stagingFull, "addon.json");
        if (!File.Exists(manifestPath))
        {
            return new ZipValidationResult(false, "Missing required addon.json at the root of the zip.");
        }

        AddonManifest? manifest;
        try
        {
            var json = await File.ReadAllTextAsync(manifestPath, ct);
            manifest = JsonSerializer.Deserialize<AddonManifest>(json, JsonFileStore.SerializerOptions);
        }
        catch (Exception ex)
        {
            return new ZipValidationResult(false, $"Invalid addon.json: {ex.Message}");
        }

        if (manifest is null)
        {
            return new ZipValidationResult(false, "addon.json is empty or invalid.");
        }

        var fieldError = ValidateManifestFields(manifest, stagingFull);
        if (fieldError is not null)
        {
            return new ZipValidationResult(false, fieldError);
        }

        // Check conflict / upgrade against already installed addons
        if (existingInstalled.TryGetValue(manifest.Id, out var installed))
        {
            if (!SemVerHelper.TryParse(manifest.Version, out var newVer) ||
                !SemVerHelper.TryParse(installed.Version, out var oldVer))
            {
                return new ZipValidationResult(false, $"Addon '{manifest.Id}' is already installed and version comparison failed.");
            }

            if (newVer <= oldVer)
            {
                return new ZipValidationResult(
                    false,
                    $"Addon '{manifest.Id}' v{installed.Version} is already installed. Upload a higher version to upgrade.");
            }

            return new ZipValidationResult(true, null, manifest, IsUpgrade: true, PreviousVersion: installed.Version);
        }

        return new ZipValidationResult(true, null, manifest, IsUpgrade: false);
    }

    public static string? ValidateManifestFields(AddonManifest manifest, string rootDir)
    {
        if (!AddonIdValidator.IsValid(manifest.Id))
        {
            return "Manifest 'id' must be lowercase letters, digits, or hyphens (2-49 chars, starting with a letter or digit).";
        }

        if (string.IsNullOrWhiteSpace(manifest.Name)) return "Manifest 'name' is required.";
        if (!SemVerHelper.TryParse(manifest.Version, out _)) return "Manifest 'version' must be valid SemVer (e.g. 1.0.0).";
        if (string.IsNullOrWhiteSpace(manifest.Description)) return "Manifest 'description' is required.";
        if (string.IsNullOrWhiteSpace(manifest.Author)) return "Manifest 'author' is required.";

        manifest.Contributes ??= new AddonContributions();

        bool FileExistsInsideRoot(string relPath)
        {
            if (string.IsNullOrWhiteSpace(relPath) || Path.IsPathRooted(relPath) || relPath.Contains("..", StringComparison.Ordinal))
            {
                return false;
            }
            var full = Path.GetFullPath(Path.Combine(rootDir, relPath));
            var prefix = Path.GetFullPath(rootDir).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            return full.StartsWith(prefix, StringComparison.Ordinal) && File.Exists(full);
        }

        foreach (var tile in manifest.Contributes.Tiles)
        {
            if (string.IsNullOrWhiteSpace(tile.Id) || string.IsNullOrWhiteSpace(tile.Name))
            {
                return "Every tile contribution must declare 'id' and 'name'.";
            }
            if (string.IsNullOrWhiteSpace(tile.Element.TagName) || !tile.Element.TagName.Contains('-'))
            {
                return $"Tile '{tile.Id}' element.tagName must be a valid custom element name containing a hyphen.";
            }
            if (!FileExistsInsideRoot(tile.Element.Script))
            {
                return $"Tile '{tile.Id}' references missing script '{tile.Element.Script}'.";
            }
            if (tile.SettingsElement is not null)
            {
                if (string.IsNullOrWhiteSpace(tile.SettingsElement.TagName) || !tile.SettingsElement.TagName.Contains('-'))
                {
                    return $"Tile '{tile.Id}' settingsElement.tagName must contain a hyphen.";
                }
                if (!FileExistsInsideRoot(tile.SettingsElement.Script))
                {
                    return $"Tile '{tile.Id}' references missing settingsElement script '{tile.SettingsElement.Script}'.";
                }
            }
        }

        if (manifest.Contributes.Server is not null)
        {
            if (string.IsNullOrWhiteSpace(manifest.Contributes.Server.Assembly) ||
                string.IsNullOrWhiteSpace(manifest.Contributes.Server.EntryType))
            {
                return "Server contribution requires both 'assembly' and 'entryType'.";
            }
            if (!FileExistsInsideRoot(manifest.Contributes.Server.Assembly))
            {
                return $"Server contribution references missing assembly '{manifest.Contributes.Server.Assembly}'.";
            }
        }

        foreach (var theme in manifest.Contributes.Themes)
        {
            if (string.IsNullOrWhiteSpace(theme.Id) || string.IsNullOrWhiteSpace(theme.Name))
            {
                return "Every theme contribution requires 'id' and 'name'.";
            }
            if (!FileExistsInsideRoot(theme.CssFile))
            {
                return $"Theme '{theme.Id}' references missing CSS file '{theme.CssFile}'.";
            }
        }

        foreach (var pack in manifest.Contributes.IconPacks)
        {
            if (string.IsNullOrWhiteSpace(pack.Id) || string.IsNullOrWhiteSpace(pack.Name))
            {
                return "Every icon pack contribution requires 'id' and 'name'.";
            }
            if (!string.IsNullOrWhiteSpace(pack.ManifestFile) && !FileExistsInsideRoot(pack.ManifestFile))
            {
                return $"Icon pack '{pack.Id}' references missing manifest file '{pack.ManifestFile}'.";
            }
        }

        return null;
    }
}
