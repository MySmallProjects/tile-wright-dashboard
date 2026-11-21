using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Tilewright.Server.Auth;
using Tilewright.Server.Models;
using Tilewright.Server.Services;
using Tilewright.Server.Storage;

namespace Tilewright.Server.Endpoints;

public static class BackupEndpoints
{
    private const long MaxBackupUploadBytes = 100 * 1024 * 1024;    // 100 MB
    private const long MaxBackupExtractedBytes = 250 * 1024 * 1024; // 250 MB
    private const string BackupMarkerFile = "tilewright-backup.json";
    private const string BackupFormatId = "tilewright-site-backup";

    private static readonly string[] SiteBackupFiles =
    [
        "site.json",
        "addons-state.json",
        "disabled-addons.txt"
    ];

    private static readonly string[] SiteBackupDirs =
    [
        "secrets",
        "site-backgrounds",
        "users",
        "addons",
        "addons-installed"
    ];

    private sealed record BackupMarker(string Format, int Version, DateTimeOffset CreatedAtUtc, string ServerVersion);

    public static IEndpointRouteBuilder MapBackupEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/backup")
            .WithTags("Backup (Admin)")
            .RequireAuthorization("AdminOnly");

        // 1. Download full site backup zip (excludes users.json & sessions.json)
        group.MapGet("/site", async (StoragePaths paths, VersionService versions, CancellationToken ct) =>
        {
            var stamp = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd_HHmmss");
            var fileName = $"tilewright-backup-{stamp}.zip";

            var ms = new MemoryStream();
            using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
            {
                var markerEntry = zip.CreateEntry(BackupMarkerFile);
                await using (var mw = new StreamWriter(markerEntry.Open(), Encoding.UTF8))
                {
                    var markerJson = JsonSerializer.Serialize(
                        new BackupMarker(BackupFormatId, 1, DateTimeOffset.UtcNow, versions.Current.Version),
                        JsonFileStore.SerializerOptions);
                    await mw.WriteAsync(markerJson);
                }

                foreach (var relFile in SiteBackupFiles)
                {
                    var full = Path.Combine(paths.Root, relFile);
                    if (File.Exists(full))
                    {
                        zip.CreateEntryFromFile(full, relFile);
                    }
                }

                foreach (var relDir in SiteBackupDirs)
                {
                    var dirFull = Path.Combine(paths.Root, relDir);
                    if (!Directory.Exists(dirFull)) continue;

                    foreach (var file in Directory.EnumerateFiles(dirFull, "*", SearchOption.AllDirectories))
                    {
                        ct.ThrowIfCancellationRequested();
                        var entryName = Path.GetRelativePath(paths.Root, file).Replace('\\', '/');
                        zip.CreateEntryFromFile(file, entryName);
                    }
                }
            }

            ms.Position = 0;
            return Results.File(ms, "application/zip", fileName);
        });

        // 2. Validate and restore site backup zip
        group.MapPost("/restore", async (
            HttpRequest request,
            bool clearFirst,
            StoragePaths paths,
            JsonFileStore files,
            CancellationToken ct) =>
        {
            if (!request.HasFormContentType)
            {
                return Results.BadRequest(new { error = "Multipart form upload expected." });
            }

            var form = await request.ReadFormAsync(ct);
            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
            if (file is null || file.Length == 0)
            {
                return Results.BadRequest(new { error = "No backup zip file provided." });
            }

            if (file.Length > MaxBackupUploadBytes)
            {
                return Results.BadRequest(new { error = "Backup zip exceeds 100 MB limit." });
            }

            var stagingDir = Path.Combine(Path.GetTempPath(), $"tw-restore-{Guid.NewGuid():N}");
            Directory.CreateDirectory(stagingDir);
            var stagingFull = Path.GetFullPath(stagingDir);
            var stagingPrefix = stagingFull + Path.DirectorySeparatorChar;

            try
            {
                long totalBytes = 0;
                await using (var uploadStream = file.OpenReadStream())
                using (var archive = new ZipArchive(uploadStream, ZipArchiveMode.Read))
                {
                    foreach (var entry in archive.Entries)
                    {
                        ct.ThrowIfCancellationRequested();
                        var entryName = entry.FullName.Replace('\\', '/');

                        if (string.IsNullOrWhiteSpace(entryName) ||
                            entryName.StartsWith('/') ||
                            Path.IsPathRooted(entryName) ||
                            entryName.Contains(':', StringComparison.Ordinal))
                        {
                            return Results.BadRequest(new { error = $"Invalid zip entry path '{entry.FullName}'." });
                        }

                        var segments = entryName.Split('/', StringSplitOptions.RemoveEmptyEntries);
                        if (segments.Any(s => s == ".."))
                        {
                            return Results.BadRequest(new { error = $"Zip-slip rejected in '{entry.FullName}'." });
                        }

                        var destPath = Path.GetFullPath(Path.Combine(stagingFull, entryName));
                        if (!destPath.StartsWith(stagingPrefix, StringComparison.Ordinal))
                        {
                            return Results.BadRequest(new { error = $"Entry '{entry.FullName}' escapes staging directory." });
                        }

                        if (entryName.EndsWith('/'))
                        {
                            Directory.CreateDirectory(destPath);
                            continue;
                        }

                        var parent = Path.GetDirectoryName(destPath);
                        if (!string.IsNullOrEmpty(parent)) Directory.CreateDirectory(parent);

                        await using var es = entry.Open();
                        await using var os = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None);
                        var buf = new byte[81920];
                        int read;
                        while ((read = await es.ReadAsync(buf, ct)) > 0)
                        {
                            totalBytes += read;
                            if (totalBytes > MaxBackupExtractedBytes)
                            {
                                return Results.BadRequest(new { error = "Extracted backup exceeds 250 MB limit." });
                            }
                            await os.WriteAsync(buf.AsMemory(0, read), ct);
                        }
                    }
                }

                // Validate Tilewright backup marker
                var markerPath = Path.Combine(stagingFull, BackupMarkerFile);
                if (!File.Exists(markerPath))
                {
                    return Results.BadRequest(new { error = $"Invalid backup zip: missing {BackupMarkerFile}." });
                }

                try
                {
                    var markerJson = await File.ReadAllTextAsync(markerPath, ct);
                    var marker = JsonSerializer.Deserialize<BackupMarker>(markerJson, JsonFileStore.SerializerOptions);
                    if (marker is null || !string.Equals(marker.Format, BackupFormatId, StringComparison.Ordinal))
                    {
                        return Results.BadRequest(new { error = "Unrecognized backup format." });
                    }
                }
                catch
                {
                    return Results.BadRequest(new { error = $"Corrupt {BackupMarkerFile} in backup zip." });
                }

                // Never overwrite users.json or sessions.json via site restore
                var stagedUsersJson = Path.Combine(stagingFull, "users.json");
                if (File.Exists(stagedUsersJson)) File.Delete(stagedUsersJson);
                var stagedSessionsJson = Path.Combine(stagingFull, "sessions.json");
                if (File.Exists(stagedSessionsJson)) File.Delete(stagedSessionsJson);
                File.Delete(markerPath);

                if (clearFirst)
                {
                    foreach (var relFile in SiteBackupFiles)
                    {
                        var full = Path.Combine(paths.Root, relFile);
                        if (File.Exists(full)) File.Delete(full);
                    }
                    foreach (var relDir in SiteBackupDirs)
                    {
                        var dirFull = Path.Combine(paths.Root, relDir);
                        if (Directory.Exists(dirFull)) Directory.Delete(dirFull, recursive: true);
                        Directory.CreateDirectory(dirFull);
                    }
                }

                // Copy staged files into DataRoot
                foreach (var srcFile in Directory.EnumerateFiles(stagingFull, "*", SearchOption.AllDirectories))
                {
                    var rel = Path.GetRelativePath(stagingFull, srcFile);
                    var target = paths.EnsureContained(Path.Combine(paths.Root, rel));
                    var parent = Path.GetDirectoryName(target);
                    if (!string.IsNullOrEmpty(parent)) Directory.CreateDirectory(parent);
                    File.Copy(srcFile, target, overwrite: true);
                }

                files.ClearCache();
                return Results.Ok(new
                {
                    restored = true,
                    clearedFirst = clearFirst,
                    restartRequired = true,
                    message = "Site backup restored. Restart the server if addons or addon settings changed."
                });
            }
            finally
            {
                if (Directory.Exists(stagingDir))
                {
                    try { Directory.Delete(stagingDir, recursive: true); } catch { /* ignore */ }
                }
            }
        }).DisableAntiforgery();

        // 3. Clear all dashboard data for all users & recreate an empty Home dashboard for each
        group.MapPost("/clear-dashboards", async (
            IUserStore users,
            IDashboardStore dashboards,
            StoragePaths paths,
            JsonFileStore files,
            CancellationToken ct) =>
        {
            if (Directory.Exists(paths.UsersDir))
            {
                foreach (var userDir in Directory.GetDirectories(paths.UsersDir))
                {
                    var dashDir = Path.Combine(userDir, "dashboards");
                    if (Directory.Exists(dashDir))
                    {
                        Directory.Delete(dashDir, recursive: true);
                    }
                }
            }

            files.ClearCache();

            var allUsers = await users.GetAllAsync(ct);
            foreach (var u in allUsers)
            {
                await dashboards.CreateAsync(u.Id, "Home", "home", ct);
            }

            return Results.Ok(new
            {
                cleared = true,
                usersReset = allUsers.Count,
                message = $"Cleared all dashboards and created a fresh Home dashboard for {allUsers.Count} user(s)."
            });
        });

        // 4. Download users.json
        group.MapGet("/users", async (IUserStore users, CancellationToken ct) =>
        {
            var all = await users.GetAllAsync(ct);
            var payload = new UsersFile { Users = [.. all] };
            var json = JsonSerializer.Serialize(payload, JsonFileStore.SerializerOptions);
            var stamp = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd_HHmmss");
            return Results.File(
                Encoding.UTF8.GetBytes(json),
                "application/json",
                $"tilewright-users-{stamp}.json");
        });

        // 5. Upload & overwrite users.json (including admin), revoking active sessions
        group.MapPost("/users", async (
            HttpRequest request,
            StoragePaths paths,
            JsonFileStore files,
            ISessionStore sessions,
            CancellationToken ct) =>
        {
            if (!request.HasFormContentType)
            {
                return Results.BadRequest(new { error = "Multipart form upload expected." });
            }

            var form = await request.ReadFormAsync(ct);
            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
            if (file is null || file.Length == 0)
            {
                return Results.BadRequest(new { error = "No users JSON file provided." });
            }

            if (file.Length > 5 * 1024 * 1024)
            {
                return Results.BadRequest(new { error = "Users file exceeds 5 MB limit." });
            }

            UsersFile? parsed;
            try
            {
                await using var stream = file.OpenReadStream();
                parsed = await JsonSerializer.DeserializeAsync<UsersFile>(stream, JsonFileStore.SerializerOptions, ct);
            }
            catch (JsonException ex)
            {
                return Results.BadRequest(new { error = $"Invalid JSON: {ex.Message}" });
            }

            if (parsed?.Users is null || parsed.Users.Count == 0)
            {
                return Results.BadRequest(new { error = "Users file must contain at least one user." });
            }

            var seenIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var u in parsed.Users)
            {
                if (!SafeId.IsValid(u.Id) || !seenIds.Add(u.Id))
                {
                    return Results.BadRequest(new { error = $"Invalid or duplicate user id '{u.Id}'." });
                }
                if (string.IsNullOrWhiteSpace(u.DisplayName))
                {
                    return Results.BadRequest(new { error = $"User '{u.Id}' is missing a displayName." });
                }
                u.Role = string.Equals(u.Role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase)
                    ? UserRoles.Admin
                    : UserRoles.User;
            }

            if (!parsed.Users.Any(u => u.Role == UserRoles.Admin))
            {
                return Results.BadRequest(new { error = "Users file must include at least one admin user." });
            }

            await files.WriteAsync(paths.UsersFile, parsed, ct);
            await sessions.RevokeAllAsync(ct);
            files.ClearCache();

            return Results.Ok(new
            {
                imported = parsed.Users.Count,
                signedOut = true,
                message = $"Imported {parsed.Users.Count} user(s). All active sessions were signed out."
            });
        }).DisableAntiforgery();

        // 6. Full Site Reset: wipes the entire data root (users, sessions, dashboards, secrets, uploaded addons)
        group.MapPost("/reset-site", (HttpContext http, StoragePaths paths, JsonFileStore files) =>
        {
            if (Directory.Exists(paths.Root))
            {
                foreach (var file in Directory.GetFiles(paths.Root))
                {
                    File.Delete(file);
                }
                foreach (var dir in Directory.GetDirectories(paths.Root))
                {
                    Directory.Delete(dir, recursive: true);
                }
            }

            Directory.CreateDirectory(paths.SecretsDir);
            Directory.CreateDirectory(paths.SiteBackgroundsDir);
            Directory.CreateDirectory(paths.UsersDir);
            Directory.CreateDirectory(paths.AddonsDataDir);
            Directory.CreateDirectory(paths.AddonsInstalledDir);
            Directory.CreateDirectory(paths.AddonsPendingDir);

            files.ClearCache();
            SessionCookieHelper.ClearSessionCookies(http, new SiteSettings());

            return Results.Ok(new
            {
                reset = true,
                message = "Site reset complete. Reloading to first-run setup..."
            });
        });

        return app;
    }
}
