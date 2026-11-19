using System.Collections.Concurrent;

namespace Tilewright.Server.Auth;

/// <summary>
/// Simple in-memory sliding-window throttling for failed password login attempts.
/// </summary>
public sealed class LoginThrottleService
{
    private const int MaxFailures = 5;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(5);

    private readonly ConcurrentDictionary<string, List<DateTimeOffset>> _failures = new(StringComparer.Ordinal);

    public bool IsBlocked(string key, out TimeSpan retryAfter)
    {
        retryAfter = TimeSpan.Zero;
        if (!_failures.TryGetValue(key, out var timestamps)) return false;

        lock (timestamps)
        {
            var cutoff = DateTimeOffset.UtcNow - Window;
            timestamps.RemoveAll(t => t < cutoff);
            if (timestamps.Count < MaxFailures) return false;

            retryAfter = (timestamps[0] + Window) - DateTimeOffset.UtcNow;
            if (retryAfter < TimeSpan.Zero) retryAfter = TimeSpan.FromSeconds(1);
            return true;
        }
    }

    public void RecordFailure(string key)
    {
        var list = _failures.GetOrAdd(key, _ => []);
        lock (list)
        {
            var cutoff = DateTimeOffset.UtcNow - Window;
            list.RemoveAll(t => t < cutoff);
            list.Add(DateTimeOffset.UtcNow);
        }
    }

    public void Reset(string key)
    {
        _failures.TryRemove(key, out _);
    }
}
