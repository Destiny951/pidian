import { type ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import type ClaudianPlugin from '../../../main';
import { findNodeExecutable } from '../../../utils/env';
import { getVaultPath } from '../../../utils/path';
import type { PiEvent } from '../adapters/types';
import type { BridgeRequest, BridgeResponse } from './protocol';

type InitPending = {
  resolve: (sessionId: string | null) => void;
  reject: (error: Error) => void;
};

type PromptPending = {
  onEvent: (event: PiEvent) => void;
  resolve: () => void;
  reject: (error: Error) => void;
};

export class PiBridgeClient {
  private plugin: ClaudianPlugin;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = '';
  private sequence = 0;
  private readyCwd: string | null = null;
  private activeSessionId: string | null = null;
  private initPending = new Map<string, InitPending>();
  private promptPending = new Map<string, PromptPending>();

  constructor(plugin: ClaudianPlugin) {
    this.plugin = plugin;
  }

  async ensureReady(cwd: string, sessionId?: string): Promise<string | null> {
    await this.ensureProcess();
    const requestedSessionId = sessionId ?? null;

    if (this.readyCwd === cwd && this.activeSessionId === requestedSessionId) {
      return this.activeSessionId;
    }

    const id = this.nextId('init');
    const resolvedSessionId = await new Promise<string | null>((resolve, reject) => {
      this.initPending.set(id, { resolve, reject });
      this.send({ type: 'init', id, cwd, sessionId: requestedSessionId ?? undefined });
    });

    this.readyCwd = cwd;
    this.activeSessionId = resolvedSessionId;
    return resolvedSessionId;
  }

  async prompt(prompt: string, onEvent: (event: PiEvent) => void): Promise<void> {
    await this.ensureProcess();

    const id = this.nextId('prompt');
    await new Promise<void>((resolve, reject) => {
      this.promptPending.set(id, { onEvent, resolve, reject });
      this.send({ type: 'prompt', id, prompt });
    });
  }

  async cancel(): Promise<void> {
    if (!this.proc) {
      return;
    }
    const id = this.nextId('cancel');
    this.send({ type: 'cancel', id });
  }

  async reset(): Promise<void> {
    if (!this.proc) {
      this.readyCwd = null;
      this.activeSessionId = null;
      return;
    }
    const id = this.nextId('reset');
    this.readyCwd = null;
    this.activeSessionId = null;
    this.send({ type: 'reset', id });
  }

  dispose(): void {
    this.handleProcessExit(new Error('PI bridge disposed'));
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  private async ensureProcess(): Promise<void> {
    if (this.proc && !this.proc.killed) {
      return;
    }

    const scriptPath = this.resolveBridgeScriptPath();
    const nodePath = findNodeExecutable() ?? 'node';

    const child = spawn(nodePath, [scriptPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.proc = child;
    this.stdoutBuffer = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      this.handleStdoutData(chunk.toString());
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString().trim();
      if (text) {
        console.error('[PiBridgeClient] bridge stderr:', text);
      }
    });

    child.on('error', (error) => {
      this.handleProcessExit(error);
    });

    child.on('exit', (code, signal) => {
      this.handleProcessExit(new Error(`PI bridge exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`));
    });
  }

  private resolveBridgeScriptPath(): string {
    const manifestDir = (this.plugin as { manifest?: { dir?: string } }).manifest?.dir;
    const manifestId = (this.plugin as { manifest?: { id?: string } }).manifest?.id ?? 'claudian';
    const vaultPath = getVaultPath(this.plugin.app);
    const vaultConfigDir = this.plugin.app?.vault?.configDir ?? '.obsidian';
    const candidates = [
      path.join(__dirname, 'pi-bridge-server.mjs'),
      manifestDir ? path.join(manifestDir, 'pi-bridge-server.mjs') : '',
      manifestDir && vaultPath ? path.join(vaultPath, vaultConfigDir, 'plugins', manifestDir, 'pi-bridge-server.mjs') : '',
      vaultPath ? path.join(vaultPath, vaultConfigDir, 'plugins', manifestId, 'pi-bridge-server.mjs') : '',
      path.join(process.cwd(), 'pi-bridge-server.mjs'),
      path.join(process.cwd(), 'scripts', 'pi-bridge-server.mjs'),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error('Could not locate pi-bridge-server.mjs');
  }

  private handleStdoutData(text: string): void {
    this.stdoutBuffer += text;

    while (true) {
      const newline = this.stdoutBuffer.indexOf('\n');
      if (newline < 0) {
        return;
      }

      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) {
        continue;
      }

      let message: BridgeResponse;
      try {
        message = JSON.parse(line) as BridgeResponse;
      } catch {
        console.error('[PiBridgeClient] Failed to parse bridge message:', line);
        continue;
      }

      this.handleBridgeMessage(message);
    }
  }

  private handleBridgeMessage(message: BridgeResponse): void {
    if (message.type === 'init_ok') {
      const pending = this.initPending.get(message.id);
      if (!pending) {
        return;
      }
      this.initPending.delete(message.id);
      this.activeSessionId = message.sessionId;
      pending.resolve(message.sessionId);
      return;
    }

    if (message.type === 'prompt_event') {
      const pending = this.promptPending.get(message.id);
      if (!pending) {
        return;
      }
      pending.onEvent(message.event);
      return;
    }

    if (message.type === 'prompt_done') {
      const pending = this.promptPending.get(message.id);
      if (!pending) {
        return;
      }
      this.promptPending.delete(message.id);
      pending.resolve();
      return;
    }

    if (message.type === 'error') {
      if (message.id) {
        const initPending = this.initPending.get(message.id);
        if (initPending) {
          this.initPending.delete(message.id);
          initPending.reject(new Error(message.message));
          return;
        }

        const promptPending = this.promptPending.get(message.id);
        if (promptPending) {
          this.promptPending.delete(message.id);
          promptPending.reject(new Error(message.message));
          return;
        }
      }

      console.error('[PiBridgeClient] bridge error:', message.message);
    }
  }

  private send(request: BridgeRequest): void {
    if (!this.proc || !this.proc.stdin.writable) {
      throw new Error('PI bridge process is not available');
    }
    this.proc.stdin.write(JSON.stringify(request) + '\n');
  }

  private handleProcessExit(error: Error): void {
    this.readyCwd = null;
    this.activeSessionId = null;

    for (const [id, pending] of this.initPending.entries()) {
      this.initPending.delete(id);
      pending.reject(error);
    }

    for (const [id, pending] of this.promptPending.entries()) {
      this.promptPending.delete(id);
      pending.reject(error);
    }

    this.proc = null;
    this.stdoutBuffer = '';
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${Date.now()}-${this.sequence}`;
  }
}
