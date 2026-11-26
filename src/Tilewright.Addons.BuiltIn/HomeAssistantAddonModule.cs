using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Tilewright.AddonContracts;

namespace Tilewright.Addons.BuiltIn;

public sealed record HaEntityState(
    string EntityId,
    string State,
    string? FriendlyName,
    string? Unit,
    string? Icon,
    DateTimeOffset UpdatedAt,
    int? Brightness = null,
    double? Min = null,
    double? Max = null,
    double? Step = null);

public sealed class HomeAssistantAddonModule : IAddonModule, IDataProvider, IActionHandler, IDynamicOptionsProvider
{
    private readonly ConcurrentDictionary<string, HaEntityState> _states = new(StringComparer.OrdinalIgnoreCase);
    private CancellationTokenSource? _wsCts;
    private Task? _wsTask;

    public string SourceName => "homeassistant";
    public IReadOnlyList<IDataProvider> DataProviders => [this];
    public IActionHandler ActionHandler => this;
    public IDynamicOptionsProvider DynamicOptionsProvider => this;

    public Task InitializeAsync(IAddonHostContext host, CancellationToken ct = default) => Task.CompletedTask;

    public Task StartAsync(IAddonHostContext host, CancellationToken ct = default)
    {
        _wsCts = new CancellationTokenSource();
        _wsTask = Task.Run(() => RunWebSocketLoopAsync(host, _wsCts.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken ct = default)
    {
        if (_wsCts is not null)
        {
            await _wsCts.CancelAsync();
            if (_wsTask is not null)
            {
                try { await _wsTask; } catch { /* ignore */ }
            }
            _wsCts.Dispose();
            _wsCts = null;
        }
    }

    public Task<object?> GetCurrentAsync(CancellationToken ct = default) =>
        Task.FromResult<object?>(_states.Values.ToList());

    public async Task<IReadOnlyList<DynamicOption>> GetOptionsAsync(
        string endpoint,
        IAddonHostContext host,
        CancellationToken ct = default)
    {
        if (!string.Equals(endpoint, "entities", StringComparison.OrdinalIgnoreCase))
        {
            return [];
        }

        var list = await FetchAllStatesRestAsync(host, ct);
        return list
            .OrderBy(e => e.FriendlyName ?? e.EntityId, StringComparer.OrdinalIgnoreCase)
            .Select(e => new DynamicOption(e.EntityId, string.IsNullOrWhiteSpace(e.FriendlyName) ? e.EntityId : $"{e.FriendlyName} ({e.EntityId})"))
            .ToList();
    }

    public async Task<object?> HandleActionAsync(
        string action,
        JsonElement? payload,
        IAddonHostContext host,
        CancellationToken ct = default)
    {
        if (payload is null) return new { error = "Missing payload." };

        var entityId = GetString(payload.Value, "entityId");
        if (string.IsNullOrWhiteSpace(entityId))
        {
            return new { needsSetup = true, error = "Select a Home Assistant entity in tile settings." };
        }

        var (baseUrl, token) = await ReadConfigAsync(host, ct);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(token))
        {
            return new { needsSetup = true, error = "Configure Home Assistant URL and access token in Settings → Addons." };
        }

        if (string.Equals(action, "get-state", StringComparison.OrdinalIgnoreCase))
        {
            var state = _states.TryGetValue(entityId, out var cached)
                ? cached
                : await FetchSingleStateRestAsync(host, baseUrl, token, entityId, ct);

            if (state is null)
            {
                return new { error = $"Entity '{entityId}' not found." };
            }

            var rules = ParseRules(payload.Value);
            var colourMatch = ColourRuleEvaluator.Evaluate(state.State, rules);
            return new
            {
                entityId = state.EntityId,
                state = state.State,
                friendlyName = state.FriendlyName,
                unit = state.Unit,
                icon = state.Icon,
                brightness = state.Brightness,
                brightnessPct = ToBrightnessPct(state.Brightness),
                min = state.Min,
                max = state.Max,
                step = state.Step,
                semanticState = colourMatch.SemanticState,
                customColour = colourMatch.CustomColour,
                updatedAt = state.UpdatedAt
            };
        }

        if (string.Equals(action, "toggle", StringComparison.OrdinalIgnoreCase))
        {
            var domain = entityId.Split('.', 2)[0];
            var service = GetString(payload.Value, "service") ?? "toggle";
            var ok = await CallServiceRestAsync(host, baseUrl, token, domain, service, entityId, null, ct);
            if (!ok) return new { error = $"Failed to call {domain}.{service}." };

            var refreshed = await FetchSingleStateRestAsync(host, baseUrl, token, entityId, ct);
            if (refreshed is not null)
            {
                _states[entityId] = refreshed;
                await host.Push.PushToSourceAsync($"ha:{entityId}", refreshed, ct);
            }
            return new
            {
                ok = true,
                state = refreshed?.State,
                brightness = refreshed?.Brightness,
                brightnessPct = ToBrightnessPct(refreshed?.Brightness)
            };
        }

        if (string.Equals(action, "set-brightness", StringComparison.OrdinalIgnoreCase))
        {
            var domain = entityId.Split('.', 2)[0];
            var pct = GetInt(payload.Value, "brightnessPct") ?? 0;
            pct = Math.Clamp(pct, 0, 100);

            bool ok;
            if (pct <= 0)
            {
                ok = await CallServiceRestAsync(host, baseUrl, token, domain, "turn_off", entityId, null, ct);
            }
            else
            {
                ok = await CallServiceRestAsync(
                    host,
                    baseUrl,
                    token,
                    domain,
                    "turn_on",
                    entityId,
                    new Dictionary<string, object> { ["brightness_pct"] = pct },
                    ct);
            }

            if (!ok) return new { error = $"Failed to set brightness on {entityId}." };

            var refreshed = await FetchSingleStateRestAsync(host, baseUrl, token, entityId, ct);
            if (refreshed is not null)
            {
                _states[entityId] = refreshed;
                await host.Push.PushToSourceAsync($"ha:{entityId}", refreshed, ct);
            }
            return new
            {
                ok = true,
                state = refreshed?.State,
                brightness = refreshed?.Brightness,
                brightnessPct = ToBrightnessPct(refreshed?.Brightness) ?? pct
            };
        }

        if (string.Equals(action, "set-value", StringComparison.OrdinalIgnoreCase))
        {
            var domain = entityId.Split('.', 2)[0];
            var value = GetDouble(payload.Value, "value");
            if (value is null || double.IsNaN(value.Value) || double.IsInfinity(value.Value))
            {
                return new { error = "Missing or invalid numeric value." };
            }

            var ok = await CallServiceRestAsync(
                host,
                baseUrl,
                token,
                domain,
                "set_value",
                entityId,
                new Dictionary<string, object> { ["value"] = value.Value },
                ct);
            if (!ok) return new { error = $"Failed to set value on {entityId}." };

            var refreshed = await FetchSingleStateRestAsync(host, baseUrl, token, entityId, ct);
            if (refreshed is not null)
            {
                _states[entityId] = refreshed;
                await host.Push.PushToSourceAsync($"ha:{entityId}", refreshed, ct);
            }
            return new
            {
                ok = true,
                state = refreshed?.State ?? value.Value.ToString(System.Globalization.CultureInfo.InvariantCulture),
                min = refreshed?.Min,
                max = refreshed?.Max,
                step = refreshed?.Step
            };
        }

        return new { error = $"Unknown action '{action}'." };
    }

    private async Task RunWebSocketLoopAsync(IAddonHostContext host, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var (baseUrl, token) = await ReadConfigAsync(host, ct);
            if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(token))
            {
                await DelayQuietlyAsync(TimeSpan.FromSeconds(10), ct);
                continue;
            }

            try
            {
                var wsUri = BuildWebSocketUri(baseUrl);
                using var ws = new ClientWebSocket();
                await ws.ConnectAsync(wsUri, ct);

                // Receive auth_required
                _ = await ReceiveJsonAsync(ws, ct);
                await SendJsonAsync(ws, new { type = "auth", access_token = token }, ct);

                var authResp = await ReceiveJsonAsync(ws, ct);
                if (authResp?.RootElement.TryGetProperty("type", out var t) == true && t.GetString() != "auth_ok")
                {
                    host.Logger.LogWarning("Home Assistant WebSocket authentication failed.");
                    await DelayQuietlyAsync(TimeSpan.FromSeconds(30), ct);
                    continue;
                }

                // Subscribe to state_changed events
                await SendJsonAsync(ws, new { id = 1, type = "subscribe_events", event_type = "state_changed" }, ct);
                host.Logger.LogInformation("Connected to Home Assistant WebSocket API.");

                while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
                {
                    using var msg = await ReceiveJsonAsync(ws, ct);
                    if (msg is null) break;

                    if (msg.RootElement.TryGetProperty("type", out var msgType) &&
                        msgType.GetString() == "event" &&
                        msg.RootElement.TryGetProperty("event", out var ev) &&
                        ev.TryGetProperty("data", out var data) &&
                        data.TryGetProperty("new_state", out var newState) &&
                        newState.ValueKind == JsonValueKind.Object)
                    {
                        var parsed = ParseEntity(newState);
                        if (parsed is not null)
                        {
                            _states[parsed.EntityId] = parsed;
                            await host.Push.PushToSourceAsync($"ha:{parsed.EntityId}", parsed, ct);
                        }
                    }
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                host.Logger.LogWarning(ex, "Home Assistant WebSocket disconnected; retrying in 10s.");
                await DelayQuietlyAsync(TimeSpan.FromSeconds(10), ct);
            }
        }
    }

    private static async Task<(string? BaseUrl, string? Token)> ReadConfigAsync(IAddonHostContext host, CancellationToken ct)
    {
        var settings = await host.Settings.GetAddonSettingsAsync(ct);
        var url = settings.TryGetValue("baseUrl", out var u) ? u.GetString()?.Trim().TrimEnd('/') : null;
        var token = await host.Secrets.GetSecretAsync("accessToken", ct);
        return (url, token);
    }

    private static Uri BuildWebSocketUri(string baseUrl)
    {
        var uri = new Uri(baseUrl);
        var scheme = uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase) ? "wss" : "ws";
        var builder = new UriBuilder(uri) { Scheme = scheme, Path = "/api/websocket" };
        return builder.Uri;
    }

    private async Task<List<HaEntityState>> FetchAllStatesRestAsync(IAddonHostContext host, CancellationToken ct)
    {
        var (baseUrl, token) = await ReadConfigAsync(host, ct);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(token)) return [];

        try
        {
            var client = host.Http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/api/states");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            using var resp = await client.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode) return [];

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            var list = new List<HaEntityState>();
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in doc.RootElement.EnumerateArray())
                {
                    var entity = ParseEntity(item);
                    if (entity is not null)
                    {
                        _states[entity.EntityId] = entity;
                        list.Add(entity);
                    }
                }
            }
            return list;
        }
        catch (Exception ex)
        {
            host.Logger.LogWarning(ex, "Failed to fetch Home Assistant entities via REST.");
            return [];
        }
    }

    private static async Task<HaEntityState?> FetchSingleStateRestAsync(
        IAddonHostContext host,
        string baseUrl,
        string token,
        string entityId,
        CancellationToken ct)
    {
        try
        {
            var client = host.Http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/api/states/{Uri.EscapeDataString(entityId)}");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            using var resp = await client.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode) return null;

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            return ParseEntity(doc.RootElement);
        }
        catch
        {
            return null;
        }
    }

    private static async Task<bool> CallServiceRestAsync(
        IAddonHostContext host,
        string baseUrl,
        string token,
        string domain,
        string service,
        string entityId,
        Dictionary<string, object>? extraFields,
        CancellationToken ct)
    {
        try
        {
            var client = host.Http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            using var req = new HttpRequestMessage(
                HttpMethod.Post,
                $"{baseUrl}/api/services/{Uri.EscapeDataString(domain)}/{Uri.EscapeDataString(service)}");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var body = new Dictionary<string, object> { ["entity_id"] = entityId };
            if (extraFields is not null)
            {
                foreach (var (k, v) in extraFields)
                {
                    body[k] = v;
                }
            }
            req.Content = new StringContent(
                JsonSerializer.Serialize(body),
                Encoding.UTF8,
                "application/json");

            using var resp = await client.SendAsync(req, ct);
            return resp.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static HaEntityState? ParseEntity(JsonElement el)
    {
        var id = GetString(el, "entity_id");
        var state = GetString(el, "state");
        if (string.IsNullOrWhiteSpace(id) || state is null) return null;

        string? friendly = null;
        string? unit = null;
        string? icon = null;
        int? brightness = null;
        double? min = null;
        double? max = null;
        double? step = null;

        if (el.TryGetProperty("attributes", out var attrs) && attrs.ValueKind == JsonValueKind.Object)
        {
            friendly = GetString(attrs, "friendly_name");
            unit = GetString(attrs, "unit_of_measurement");
            icon = GetString(attrs, "icon");
            if (attrs.TryGetProperty("brightness", out var bProp) &&
                bProp.ValueKind == JsonValueKind.Number &&
                bProp.TryGetInt32(out var bVal))
            {
                brightness = Math.Clamp(bVal, 0, 255);
            }
            min = GetDouble(attrs, "min");
            max = GetDouble(attrs, "max");
            step = GetDouble(attrs, "step");
        }

        return new HaEntityState(id, state, friendly, unit, icon, DateTimeOffset.UtcNow, brightness, min, max, step);
    }

    private static List<ColourRule> ParseRules(JsonElement payload)
    {
        var rules = new List<ColourRule>();
        if (!payload.TryGetProperty("colourRules", out var arr) || arr.ValueKind != JsonValueKind.Array)
            return rules;

        foreach (var item in arr.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            rules.Add(new ColourRule(
                GetString(item, "operator") ?? ">",
                GetString(item, "threshold") ?? "",
                GetString(item, "semanticState") ?? "warning",
                GetString(item, "customColour")));
        }
        return rules;
    }

    private static async Task SendJsonAsync(ClientWebSocket ws, object obj, CancellationToken ct)
    {
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(obj));
        await ws.SendAsync(bytes, WebSocketMessageType.Text, true, ct);
    }

    private static async Task<JsonDocument?> ReceiveJsonAsync(ClientWebSocket ws, CancellationToken ct)
    {
        var buffer = new byte[16384];
        using var ms = new MemoryStream();
        while (true)
        {
            var res = await ws.ReceiveAsync(buffer, ct);
            if (res.MessageType == WebSocketMessageType.Close) return null;
            ms.Write(buffer, 0, res.Count);
            if (res.EndOfMessage) break;
        }
        return JsonDocument.Parse(ms.ToArray());
    }

    private static async Task DelayQuietlyAsync(TimeSpan delay, CancellationToken ct)
    {
        try { await Task.Delay(delay, ct); } catch (OperationCanceledException) { /* ignore */ }
    }

    private static string? GetString(JsonElement el, string prop) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString()
            : null;

    private static int? GetInt(JsonElement el, string prop)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(prop, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i)) return i;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d)) return (int)Math.Round(d);
        if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out var parsed)) return parsed;
        return null;
    }

    private static double? GetDouble(JsonElement el, string prop)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(prop, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d)) return d;
        if (v.ValueKind == JsonValueKind.String &&
            double.TryParse(v.GetString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }
        return null;
    }

    private static int? ToBrightnessPct(int? brightness) =>
        brightness.HasValue ? (int)Math.Round(Math.Clamp(brightness.Value, 0, 255) * 100.0 / 255.0) : null;
}
