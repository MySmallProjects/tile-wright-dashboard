using System.Collections.Concurrent;
using System.Text.Json;

namespace Tilewright.Server.Storage;

/// <summary>
/// Thread-safe, atomic JSON file persistence with per-file locking, in-memory cache,
/// and corrupt-file recovery (backs up corrupt file to .bak and returns default value).
/// </summary>
public sealed class JsonFileStore
{
    public static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, string> _jsonCache = new(StringComparer.Ordinal);
    private readonly ILogger<JsonFileStore> _logger;

    public JsonFileStore(ILogger<JsonFileStore> logger)
    {
        _logger = logger;
    }

    private SemaphoreSlim GetLock(string path) =>
        _locks.GetOrAdd(Path.GetFullPath(path), _ => new SemaphoreSlim(1, 1));

    public async Task<T> ReadAsync<T>(string path, Func<T> defaultFactory, CancellationToken ct = default)
    {
        var fullPath = Path.GetFullPath(path);
        var gate = GetLock(fullPath);
        await gate.WaitAsync(ct);
        try
        {
            return await ReadUnlockedAsync(fullPath, defaultFactory, ct);
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task WriteAsync<T>(string path, T value, CancellationToken ct = default)
    {
        var fullPath = Path.GetFullPath(path);
        var gate = GetLock(fullPath);
        await gate.WaitAsync(ct);
        try
        {
            await WriteUnlockedAsync(fullPath, value, ct);
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<T> UpdateAsync<T>(
        string path,
        Func<T> defaultFactory,
        Action<T> mutate,
        CancellationToken ct = default)
    {
        var fullPath = Path.GetFullPath(path);
        var gate = GetLock(fullPath);
        await gate.WaitAsync(ct);
        try
        {
            var current = await ReadUnlockedAsync(fullPath, defaultFactory, ct);
            mutate(current);
            await WriteUnlockedAsync(fullPath, current, ct);
            return current;
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<TResult> UpdateAsync<T, TResult>(
        string path,
        Func<T> defaultFactory,
        Func<T, TResult> mutate,
        CancellationToken ct = default)
    {
        var fullPath = Path.GetFullPath(path);
        var gate = GetLock(fullPath);
        await gate.WaitAsync(ct);
        try
        {
            var current = await ReadUnlockedAsync(fullPath, defaultFactory, ct);
            var result = mutate(current);
            await WriteUnlockedAsync(fullPath, current, ct);
            return result;
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task DeleteFileAsync(string path, CancellationToken ct = default)
    {
        var fullPath = Path.GetFullPath(path);
        var gate = GetLock(fullPath);
        await gate.WaitAsync(ct);
        try
        {
            _jsonCache.TryRemove(fullPath, out _);
            if (File.Exists(fullPath))
            {
                File.Delete(fullPath);
            }
        }
        finally
        {
            gate.Release();
        }
    }

    public void InvalidatePrefix(string directoryPath)
    {
        var prefix = Path.GetFullPath(directoryPath);
        foreach (var key in _jsonCache.Keys)
        {
            if (key.StartsWith(prefix, StringComparison.Ordinal))
            {
                _jsonCache.TryRemove(key, out _);
            }
        }
    }

    private async Task<T> ReadUnlockedAsync<T>(string fullPath, Func<T> defaultFactory, CancellationToken ct)
    {
        if (_jsonCache.TryGetValue(fullPath, out var cachedJson))
        {
            var deserialized = JsonSerializer.Deserialize<T>(cachedJson, SerializerOptions);
            if (deserialized is not null)
            {
                return deserialized;
            }
        }

        if (!File.Exists(fullPath))
        {
            return defaultFactory();
        }

        try
        {
            var json = await File.ReadAllTextAsync(fullPath, ct);
            var value = JsonSerializer.Deserialize<T>(json, SerializerOptions);
            if (value is null)
            {
                BackupCorruptFile(fullPath, "Deserialized to null");
                return defaultFactory();
            }

            _jsonCache[fullPath] = json;
            return value;
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            BackupCorruptFile(fullPath, ex.Message);
            return defaultFactory();
        }
    }

    private async Task WriteUnlockedAsync<T>(string fullPath, T value, CancellationToken ct)
    {
        var dir = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        var json = JsonSerializer.Serialize(value, SerializerOptions);
        var tempPath = $"{fullPath}.tmp.{Guid.NewGuid():N}";

        try
        {
            await using (var fs = new FileStream(tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            await using (var writer = new StreamWriter(fs))
            {
                await writer.WriteAsync(json.AsMemory(), ct);
                await writer.FlushAsync(ct);
                fs.Flush(flushToDisk: true);
            }

            File.Move(tempPath, fullPath, overwrite: true);
            _jsonCache[fullPath] = json;
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                try { File.Delete(tempPath); } catch { /* best-effort cleanup */ }
            }
        }
    }

    private void BackupCorruptFile(string fullPath, string reason)
    {
        _jsonCache.TryRemove(fullPath, out _);
        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmssfff");
        var bakPath = $"{fullPath}.corrupt.{stamp}.bak";
        try
        {
            if (File.Exists(fullPath))
            {
                File.Move(fullPath, bakPath, overwrite: true);
            }
            _logger.LogWarning(
                "Corrupt JSON file detected at {Path} ({Reason}). Moved to {BackupPath} and restored default.",
                fullPath, reason, bakPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to back up corrupt JSON file {Path}.", fullPath);
        }
    }
}
