import { NEAR_RPC_NODES } from '@/config';
import request from '@/utils/request';

class RPCManager {
  private fastestNodeUrl: string | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private isInitialized = false;

  async ping(nodeUrl: string) {
    try {
      const start = Date.now();
      await request(nodeUrl, {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 'dontcare', method: 'status', params: [] }),
        retryCount: 0,
        timeout: 5000,
      });
      const delay = Date.now() - start;
      return delay;
    } catch (error) {
      return -1;
    }
  }

  async pingAll() {
    const nodes = Object.entries(NEAR_RPC_NODES);
    const results = await Promise.all(
      nodes.map(async ([name, url]) => {
        const delay = await this.ping(url);
        return { name, url, delay };
      }),
    );

    const validNodes = results.filter((node) => node.delay !== -1);

    if (validNodes.length === 0) {
      console.warn('All RPC nodes ping failed, using default node');
      this.fastestNodeUrl = Object.values(NEAR_RPC_NODES)[0];
      return;
    }

    const fastest = validNodes.reduce((prev, current) =>
      prev.delay < current.delay ? prev : current,
    );

    this.fastestNodeUrl = fastest.url;

    const allNodesStatus = results
      .map((n) => `${n.name}: ${n.delay === -1 ? 'failed' : `${n.delay}ms`}`)
      .join(', ');

    console.log(
      `Fastest RPC node: ${fastest.name} (${fastest.delay}ms) | All nodes: ${allNodesStatus}`,
    );
  }

  getFastestNode() {
    return this.fastestNodeUrl || Object.values(NEAR_RPC_NODES)[0];
  }

  startAutoUpdate() {
    if (typeof window === 'undefined' || this.isInitialized) return;

    this.isInitialized = true;

    this.pingAll();

    this.intervalId = setInterval(
      () => {
        this.pingAll();
      },
      1 * 60 * 1000,
    );
  }

  stopAutoUpdate() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isInitialized = false;
    }
  }
}

export const rpcManager = new RPCManager();

if (typeof window !== 'undefined') {
  rpcManager.startAutoUpdate();
}
