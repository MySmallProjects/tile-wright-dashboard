using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Tilewright.Server.Services;

namespace Tilewright.Server.Hubs;

[Authorize]
public sealed class DashboardHub(VersionService versions, ILogger<DashboardHub> logger) : Hub
{
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("ServerInfo", new
        {
            version = versions.Current.Version,
            buildNumber = versions.Current.BuildNumber,
            connectedAt = DateTimeOffset.UtcNow
        });
        await base.OnConnectedAsync();
    }

    public async Task Subscribe(string source)
    {
        if (string.IsNullOrWhiteSpace(source)) return;
        await Groups.AddToGroupAsync(Context.ConnectionId, $"source:{source.Trim()}");
        logger.LogDebug("Connection {ConnectionId} subscribed to {Source}", Context.ConnectionId, source);
    }

    public async Task Unsubscribe(string source)
    {
        if (string.IsNullOrWhiteSpace(source)) return;
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"source:{source.Trim()}");
    }

    public Task<object> InvokeAction(string addonId, string action, JsonElement? payload)
    {
        // Phase 5 will route this to registered IActionHandler addon components.
        logger.LogInformation(
            "Action invoked by user {User} for addon {AddonId}: {Action}",
            Context.UserIdentifier, addonId, action);

        return Task.FromResult<object>(new
        {
            accepted = true,
            addonId,
            action,
            timestamp = DateTimeOffset.UtcNow
        });
    }

    public Task<object> Ping() =>
        Task.FromResult<object>(new
        {
            serverTime = DateTimeOffset.UtcNow,
            version = versions.Current.Version
        });
}
