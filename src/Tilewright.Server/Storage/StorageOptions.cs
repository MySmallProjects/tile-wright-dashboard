namespace Tilewright.Server.Storage;

public sealed class StorageOptions
{
    public string DataRoot { get; set; } = "data";

    public string ResolveDataRoot(string contentRootPath)
    {
        var full = Path.IsPathRooted(DataRoot)
            ? DataRoot
            : Path.GetFullPath(Path.Combine(contentRootPath, DataRoot));
        return full;
    }
}

public sealed class StoragePaths
{
    public string Root { get; }

    public StoragePaths(string root)
    {
        Root = Path.GetFullPath(root);
        EnsureBaseDirectories();
    }

    public string SiteFile => Path.Combine(Root, "site.json");
    public string UsersFile => Path.Combine(Root, "users.json");
    public string SessionsFile => Path.Combine(Root, "sessions.json");
    public string SecretsDir => Path.Combine(Root, "secrets");
    public string SiteBackgroundsDir => Path.Combine(Root, "site-backgrounds");
    public string UsersDir => Path.Combine(Root, "users");
    public string AddonsDataDir => Path.Combine(Root, "addons");
    public string AddonsInstalledDir => Path.Combine(Root, "addons-installed");
    public string AddonsPendingDir => Path.Combine(Root, "addons-pending");

    public string UserDir(string userId)
    {
        SafeId.Validate(userId, nameof(userId));
        return EnsureContained(Path.Combine(UsersDir, userId));
    }

    public string UserSettingsFile(string userId) => Path.Combine(UserDir(userId), "settings.json");
    public string UserBackgroundsDir(string userId) => Path.Combine(UserDir(userId), "backgrounds");
    public string UserDashboardsDir(string userId) => Path.Combine(UserDir(userId), "dashboards");
    public string UserDashboardsIndexFile(string userId) => Path.Combine(UserDashboardsDir(userId), "index.json");

    public string DashboardDir(string userId, string dashboardId)
    {
        SafeId.Validate(dashboardId, nameof(dashboardId));
        return EnsureContained(Path.Combine(UserDashboardsDir(userId), dashboardId));
    }

    public string DashboardLayoutFile(string userId, string dashboardId) =>
        Path.Combine(DashboardDir(userId, dashboardId), "layout.json");

    public string DashboardTilesDir(string userId, string dashboardId) =>
        Path.Combine(DashboardDir(userId, dashboardId), "tiles");

    public string DashboardDataDir(string userId, string dashboardId) =>
        Path.Combine(DashboardDir(userId, dashboardId), "data");

    public string TileSettingsFile(string userId, string dashboardId, string tileId)
    {
        SafeId.Validate(tileId, nameof(tileId));
        return EnsureContained(Path.Combine(DashboardTilesDir(userId, dashboardId), $"{tileId}.json"));
    }

    public string TileDataFile(string userId, string dashboardId, string tileId)
    {
        SafeId.Validate(tileId, nameof(tileId));
        return EnsureContained(Path.Combine(DashboardDataDir(userId, dashboardId), $"{tileId}.json"));
    }

    public string UserBackgroundFile(string userId, string imageId)
    {
        SafeId.Validate(imageId, nameof(imageId));
        return EnsureContained(Path.Combine(UserBackgroundsDir(userId), $"{imageId}.webp"));
    }

    public string SiteBackgroundFile(string imageId)
    {
        SafeId.Validate(imageId, nameof(imageId));
        return EnsureContained(Path.Combine(SiteBackgroundsDir, $"{imageId}.webp"));
    }

    public string EnsureContained(string path)
    {
        var full = Path.GetFullPath(path);
        var rootWithSep = Root.EndsWith(Path.DirectorySeparatorChar)
            ? Root
            : Root + Path.DirectorySeparatorChar;
        if (!full.StartsWith(rootWithSep, StringComparison.Ordinal))
        {
            throw new ArgumentException("Path escapes data root.", nameof(path));
        }
        return full;
    }

    private void EnsureBaseDirectories()
    {
        Directory.CreateDirectory(Root);
        Directory.CreateDirectory(SecretsDir);
        Directory.CreateDirectory(SiteBackgroundsDir);
        Directory.CreateDirectory(UsersDir);
        Directory.CreateDirectory(AddonsDataDir);
        Directory.CreateDirectory(AddonsInstalledDir);
        Directory.CreateDirectory(AddonsPendingDir);
    }
}
