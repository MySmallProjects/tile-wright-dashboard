using System.Net;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Tilewright.Server.Auth;
using Tilewright.Server.Endpoints;
using Tilewright.Server.Hubs;
using Tilewright.Server.Models;
using Tilewright.Server.Services;
using Tilewright.Server.Storage;

var builder = WebApplication.CreateBuilder(args);

// Storage paths & JSON stores (atomic writes + in-memory cache)
builder.Services.AddSingleton(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    var env = sp.GetRequiredService<IWebHostEnvironment>();
    var storageOptions = config.GetSection("Tilewright").Get<StorageOptions>() ?? new StorageOptions();
    return new StoragePaths(storageOptions.ResolveDataRoot(env.ContentRootPath));
});
builder.Services.AddSingleton<JsonFileStore>();
builder.Services.AddSingleton<ISiteStore, JsonSiteStore>();
builder.Services.AddSingleton<IUserStore, JsonUserStore>();
builder.Services.AddSingleton<ISessionStore, JsonSessionStore>();
builder.Services.AddSingleton<IDashboardStore, JsonDashboardStore>();

// Auth, throttling & versioning
builder.Services.AddSingleton<PasswordHasher<UserRecord>>();
builder.Services.AddSingleton<LoginThrottleService>();
builder.Services.AddSingleton<VersionService>();

builder.Services
    .AddAuthentication(SessionAuthenticationHandler.SchemeName)
    .AddScheme<AuthenticationSchemeOptions, SessionAuthenticationHandler>(
        SessionAuthenticationHandler.SchemeName, _ => { });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy =>
        policy.RequireAuthenticatedUser().RequireRole(UserRoles.Admin));
});

// Forwarded headers: trust ONLY localhost/loopback proxy (nginx) so LAN clients cannot spoof HTTPS
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownProxies.Clear();
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Add(IPAddress.Loopback);
    options.KnownProxies.Add(IPAddress.IPv6Loopback);
});

builder.Services.AddSignalR();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "Tilewright API", Version = "v1" });
});

var app = builder.Build();

// Must run before HTTPS/HSTS and auth so Request.IsHttps reflects nginx X-Forwarded-Proto
app.UseForwardedHeaders();

// Emit HSTS only when the effective request is HTTPS
app.Use(async (context, next) =>
{
    if (context.Request.IsHttps)
    {
        context.Response.OnStarting(() =>
        {
            context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
            return Task.CompletedTask;
        });
    }
    await next();
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Serve static files from wwwroot (Phase 3+ Svelte build) with no-cache on index.html
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        if (string.Equals(ctx.File.Name, "index.html", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
        }
    }
});

app.UseAuthentication();
app.UseAuthorization();

// Minimal API endpoint groups
app.MapVersionEndpoints();
app.MapAuthEndpoints();
app.MapUserEndpoints();
app.MapSiteEndpoints();
app.MapDashboardEndpoints();
app.MapBackgroundEndpoints();

// SignalR live push hub
app.MapHub<DashboardHub>("/hubs/dashboard");

// SPA fallback to index.html for client-side routes (non-API)
app.MapFallbackToFile("index.html");

var versionInfo = app.Services.GetRequiredService<VersionService>().Current;
var storagePaths = app.Services.GetRequiredService<StoragePaths>();
app.Logger.LogInformation(
    "Tilewright Server {Version} ({Configuration}) starting. DataRoot={DataRoot}",
    versionInfo.Version, versionInfo.Configuration, storagePaths.Root);

app.Run();

public partial class Program;
