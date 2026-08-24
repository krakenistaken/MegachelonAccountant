// src/lib/sse.ts
// Server-Sent Events (SSE) broadcast manager for real-time sync

type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController;
};

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();

  /**
   * Register a new SSE client
   */
  addClient(id: string, controller: ReadableStreamDefaultController) {
    this.clients.set(id, { id, controller });
    console.log(`[SSE] Client connected: ${id} (total: ${this.clients.size})`);
  }

  /**
   * Remove a disconnected SSE client
   */
  removeClient(id: string) {
    this.clients.delete(id);
    console.log(`[SSE] Client disconnected: ${id} (total: ${this.clients.size})`);
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcast(event: string, data: unknown) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(message);

    for (const [id, client] of this.clients) {
      try {
        client.controller.enqueue(encoded);
      } catch {
        // Client disconnected, remove from list
        this.removeClient(id);
      }
    }
  }

  /**
   * Get the number of connected clients
   */
  get clientCount() {
    return this.clients.size;
  }
}

// Singleton instance — persists across API route invocations in dev mode
// Using globalThis to survive HMR in Next.js development
const globalForSSE = globalThis as unknown as { sseManager: SSEManager };

export const sseManager = globalForSSE.sseManager ?? new SSEManager();

if (process.env.NODE_ENV !== 'production') {
  globalForSSE.sseManager = sseManager;
}
