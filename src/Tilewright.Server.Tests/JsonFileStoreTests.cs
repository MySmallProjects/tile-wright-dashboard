using Microsoft.Extensions.Logging.Abstractions;
using Tilewright.Server.Storage;
using Xunit;

namespace Tilewright.Server.Tests;

public sealed class JsonFileStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), $"tw-store-{Guid.NewGuid():N}");

    private sealed class SampleDoc
    {
        public int Count { get; set; }
        public string Name { get; set; } = "default";
    }

    [Fact]
    public async Task AtomicWrite_AndReloadFromFreshStore_PreservesData()
    {
        var path = Path.Combine(_dir, "sample.json");
        var store1 = new JsonFileStore(NullLogger<JsonFileStore>.Instance);

        await store1.WriteAsync(path, new SampleDoc { Count = 42, Name = "saved" });

        // Fresh store has empty memory cache, forcing disk read
        var store2 = new JsonFileStore(NullLogger<JsonFileStore>.Instance);
        var loaded = await store2.ReadAsync(path, () => new SampleDoc());

        Assert.Equal(42, loaded.Count);
        Assert.Equal("saved", loaded.Name);
        // No leftover .tmp files
        Assert.Empty(Directory.GetFiles(_dir, "*.tmp.*"));
    }

    [Fact]
    public async Task CorruptJson_BacksUpToBakAndReturnsDefaultWithoutCrashing()
    {
        Directory.CreateDirectory(_dir);
        var path = Path.Combine(_dir, "broken.json");
        await File.WriteAllTextAsync(path, "{ this is not valid json !!!");

        var store = new JsonFileStore(NullLogger<JsonFileStore>.Instance);
        var loaded = await store.ReadAsync(path, () => new SampleDoc { Count = 7, Name = "recovered" });

        Assert.Equal(7, loaded.Count);
        Assert.Equal("recovered", loaded.Name);
        var backups = Directory.GetFiles(_dir, "broken.json.corrupt.*.bak");
        Assert.Single(backups);
    }

    [Fact]
    public async Task ConcurrentUpdates_AreSerializedByPerFileLock()
    {
        var path = Path.Combine(_dir, "counter.json");
        var store = new JsonFileStore(NullLogger<JsonFileStore>.Instance);

        var tasks = Enumerable.Range(0, 20)
            .Select(_ => store.UpdateAsync(path, () => new SampleDoc(), d => d.Count++));
        await Task.WhenAll(tasks);

        var finalDoc = await store.ReadAsync(path, () => new SampleDoc());
        Assert.Equal(20, finalDoc.Count);
    }

    public void Dispose()
    {
        if (Directory.Exists(_dir))
        {
            Directory.Delete(_dir, recursive: true);
        }
    }
}
