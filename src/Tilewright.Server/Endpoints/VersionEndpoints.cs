using Tilewright.Server.Services;

namespace Tilewright.Server.Endpoints;

public static class VersionEndpoints
{
    public static IEndpointRouteBuilder MapVersionEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/version", (VersionService versions) => Results.Ok(versions.Current))
            .WithTags("System")
            .WithName("GetVersion")
            .AllowAnonymous();

        return app;
    }
}
