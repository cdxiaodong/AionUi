/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto';
import * as http from 'http';
import type { HookJob } from './HookStore';

const DEFAULT_WEBHOOK_PORT = 9880;

/**
 * WebhookHandler - Standalone HTTP server for receiving webhooks
 *
 * Runs its own lightweight HTTP server independent of the WebUI Express app.
 * All webhooks are handled via: POST /api/hooks/webhook/:hookId
 */
export class WebhookHandler {
  private hooks: Map<string, HookJob> = new Map();
  private server: http.Server | null = null;
  private triggerFn: ((hook: HookJob, payload: string) => Promise<void>) | null = null;
  private _port = DEFAULT_WEBHOOK_PORT;
  private _host = '127.0.0.1';

  get port(): number {
    return this._port;
  }

  get host(): string {
    return this._host;
  }

  /**
   * Set trigger function
   */
  setTriggerFn(triggerFn: (hook: HookJob, payload: string) => Promise<void>): void {
    this.triggerFn = triggerFn;
  }

  /**
   * Start the standalone webhook HTTP server
   */
  async startServer(port?: number, host?: string): Promise<void> {
    if (this.server) return;

    this._port = port ?? DEFAULT_WEBHOOK_PORT;
    this._host = host ?? '127.0.0.1';

    this.server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-hub-signature-256');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      // Parse route: /api/hooks/webhook/:hookId
      const match = req.url?.match(/^\/api\/hooks\/webhook\/([^/?]+)/);
      if (!match) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      const hookId = match[1];

      // Read body
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        void this.handleRequest(hookId, body, req.headers, res);
      });
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this._port, this._host, () => {
        console.log(`[WebhookHandler] Webhook server listening on http://${this._host}:${this._port}`);
        resolve();
      });
      this.server!.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[WebhookHandler] Port ${this._port} in use, trying ${this._port + 1}`);
          this._port++;
          this.server!.listen(this._port, this._host);
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Register a hook for webhook handling
   */
  register(hook: HookJob): void {
    this.hooks.set(hook.id, hook);
    console.log(`[WebhookHandler] Registered webhook: ${hook.id}`);
  }

  /**
   * Unregister a hook
   */
  unregister(hookId: string): void {
    this.hooks.delete(hookId);
    console.log(`[WebhookHandler] Unregistered webhook: ${hookId}`);
  }

  /**
   * Update a registered hook's data
   */
  updateHook(hook: HookJob): void {
    if (this.hooks.has(hook.id)) {
      this.hooks.set(hook.id, hook);
    }
  }

  /**
   * Handle incoming webhook request
   */
  private async handleRequest(hookId: string, body: string, headers: http.IncomingHttpHeaders, res: http.ServerResponse): Promise<void> {
    const hook = this.hooks.get(hookId);

    if (!hook || !hook.enabled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Hook not found or disabled' }));
      return;
    }

    // Parse body as JSON (fallback to raw string)
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      parsedBody = body;
    }

    // Verify HMAC secret if configured
    if (hook.config.kind === 'webhook' && hook.config.secret) {
      const signature = headers['x-hub-signature-256'] as string | undefined;
      if (!signature) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing signature' }));
        return;
      }

      const payload = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody);
      const expected = 'sha256=' + crypto.createHmac('sha256', hook.config.secret).update(payload).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid signature' }));
        return;
      }
    }

    if (!this.triggerFn) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Hook service not ready' }));
      return;
    }

    try {
      const payload = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody);
      await this.triggerFn(hook, payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, hookId }));
    } catch (err) {
      console.error(`[WebhookHandler] Error processing webhook ${hookId}:`, err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
  }

  /**
   * Cleanup: stop server and clear hooks
   */
  cleanup(): void {
    this.hooks.clear();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

export const webhookHandler = new WebhookHandler();
