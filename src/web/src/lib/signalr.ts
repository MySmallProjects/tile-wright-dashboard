import * as signalR from '@microsoft/signalr';

export interface HubCallbacks {
  onServerVersion: (version: string) => void;
  onStateChange: (connected: boolean) => void;
  onDataUpdate?: (source: string, payload: unknown) => void;
}

export class DashboardHubClient {
  private connection: signalR.HubConnection | null = null;
  private activeSources = new Set<string>();

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

    conn.on('DataUpdate', (msg: { source?: string; payload?: unknown }) => {
      if (msg?.source && callbacks.onDataUpdate) {
        callbacks.onDataUpdate(msg.source, msg.payload);
      }
    });

    conn.onreconnecting(() => callbacks.onStateChange(false));
    conn.onreconnected(async () => {
      callbacks.onStateChange(true);
      for (const src of this.activeSources) {
        try {
          await conn.invoke('Subscribe', src);
        } catch {
          // ignore resubscribe error
        }
      }
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
      for (const src of this.activeSources) {
        try {
          await conn.invoke('Subscribe', src);
        } catch {
          // ignore
        }
      }
    } catch {
      callbacks.onStateChange(false);
    }
  }

  async subscribe(source: string): Promise<void> {
    this.activeSources.add(source);
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke('Subscribe', source);
      } catch {
        // ignore
      }
    }
  }

  async unsubscribe(source: string): Promise<void> {
    this.activeSources.delete(source);
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke('Unsubscribe', source);
      } catch {
        // ignore
      }
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
