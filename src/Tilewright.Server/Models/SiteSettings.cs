namespace Tilewright.Server.Models;

public sealed class BackgroundSettings
{
    /// <summary>theme | solid | image</summary>
    public string Mode { get; set; } = "theme";
    public string? Color { get; set; }
    public string? ImageId { get; set; }
    /// <summary>cover | contain</summary>
    public string Fit { get; set; } = "cover";
    public int Blur { get; set; }
    public int Dim { get; set; } = 25;
}

public sealed class SiteSettings
{
    public string DefaultTheme { get; set; } = "light";
    public BackgroundSettings DefaultBackground { get; set; } = new();
    public bool ForceSecureCookies { get; set; }
    public bool AutoLoginEnabled { get; set; }
}
