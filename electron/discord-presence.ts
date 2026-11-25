import { Client } from '@xhayper/discord-rpc';

export type DiscordPresenceSettings = {
  discordActivityEnabled: boolean;
  discordClientId: string;
};

export const isValidDiscordClientId = (clientId: string) => /^\d{17,20}$/.test(clientId);

export const buildUmbrellaActivity = () => ({
  details: 'Naviga con Umbrella',
  state: 'Browser in uso',
  largeImageKey: 'umbrella',
  largeImageText: 'Umbrella Browser'
});

export class DiscordPresenceController {
  private client: Client | null = null;
  private clientId = '';
  private connecting = false;
  private retryTimer: NodeJS.Timeout | null = null;
  private generation = 0;

  sync(settings: DiscordPresenceSettings) {
    const clientId = settings.discordClientId.trim();
    if (!settings.discordActivityEnabled || !isValidDiscordClientId(clientId)) {
      void this.disconnect();
      return;
    }
    if (this.client && this.clientId === clientId && (this.connecting || this.client.isConnected)) return;
    void this.connect(clientId);
  }

  async dispose() {
    await this.disconnect();
  }

  private async connect(clientId: string) {
    const generation = ++this.generation;
    this.clearRetryTimer();
    const previousClient = this.client;
    this.client = null;
    this.clientId = '';
    this.connecting = false;
    if (previousClient) await this.destroyClient(previousClient);
    if (generation !== this.generation) return;

    const client = new Client({ clientId });
    this.client = client;
    this.clientId = clientId;
    this.connecting = true;

    client.on('ready', () => {
      if (this.client !== client) return;
      this.connecting = false;
      const user = client.user;
      if (!user) {
        console.warn('[Umbrella] Discord RPC connected without a client user.');
        this.scheduleRetry(clientId, generation);
        return;
      }
      void user.setActivity(buildUmbrellaActivity()).catch((error) => {
        console.warn('[Umbrella] Could not update Discord activity:', error);
        this.scheduleRetry(clientId, generation);
      });
    });

    client.on('disconnected', () => {
      if (this.client !== client) return;
      this.client = null;
      this.clientId = '';
      this.connecting = false;
      this.scheduleRetry(clientId, generation);
    });

    try {
      await client.login();
      if (this.client === client) this.connecting = false;
    } catch (error) {
      if (this.client !== client) return;
      console.warn('[Umbrella] Could not connect to the Discord desktop app:', error);
      this.client = null;
      this.clientId = '';
      this.connecting = false;
      await this.destroyClient(client);
      this.scheduleRetry(clientId, generation);
    }
  }

  private async disconnect() {
    this.generation += 1;
    this.clearRetryTimer();
    const client = this.client;
    this.client = null;
    this.clientId = '';
    this.connecting = false;
    if (client) await this.destroyClient(client);
  }

  private scheduleRetry(clientId: string, generation: number) {
    if (generation !== this.generation || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (generation === this.generation) void this.connect(clientId);
    }, 30_000);
  }

  private clearRetryTimer() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private async destroyClient(client: Client) {
    try {
      await client.destroy();
    } catch (error) {
      console.warn('[Umbrella] Could not close the Discord RPC connection:', error);
    }
  }
}
