import * as signalR from '@microsoft/signalr';

export interface HubCallbacks {
  onServerVersion: (version: string) => void;
  onStateChange: (connected: boolean) => void;
}

export class DashboardHubClient {
  private connection: signalR.HubConnection | null = null;

  async start(callbacks: HubCallbacks): Promise<void> {
    await this.stop();

    const conn = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/dashboard')
      .withAutomaticReconnect([1000, 3000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    conn.on('ServerInfo', (info: { version?: string }) => {
      if (info?.version) {
        callbacks.onServerVersion(info.version);
      }
    });

    conn.onreconnecting(() => callbacks.onStateChange(false));
    conn.onreconnected(async () => {
      callbacks.onStateChange(true);
      try {
        const res = await conn.invoke<{ version?: string }>('Ping');
        if (res?.version) callbacks.onServerVersion(res.version);
      } catch {
        // fallback version check happens via HTTP
      }
    });
    conn.onclose(() => callbacks.onStateChange(false));

    this.connection = conn;

    try {
      await conn.start();
      callbacks.onStateChange(true);
    } catch {
      callbacks.onStateChange(false);
    }
  }

  async stop(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.stop();
      } catch {
        // ignore stop errors
      }
      this.connection = null;
    }
  }
}
