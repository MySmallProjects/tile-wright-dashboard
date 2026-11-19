using Tilewright.Server.Models;
using Tilewright.Server.Storage;

namespace Tilewright.Server.Endpoints;

public static class SiteEndpoints
{
    public static IEndpointRouteBuilder MapSiteEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/site").WithTags("Site Settings");

        group.MapGet("/", async (ISiteStore siteStore, CancellationToken ct) =>
        {
            var settings = await siteStore.GetAsync(ct);
            return Results.Ok(settings);
        }).AllowAnonymous();

        group.MapPut("/", async (SiteSettings req, ISiteStore siteStore, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.DefaultTheme))
            {
                req.DefaultTheme = "light";
            }
            req.DefaultBackground ??= new BackgroundSettings();
            var saved = await siteStore.SaveAsync(req, ct);
            return Results.Ok(saved);
        }).RequireAuthorization("AdminOnly");

        return app;
    }
}
