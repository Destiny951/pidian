import { type ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import type PidianPlugin from '../../../main';
import { findNodeExecutable, getEnhancedPath, parseEnvironmentVariables } from '../../../utils/env';
import { getVaultPath } from '../../../utils/path';
import type { PiEvent } from '../adapters/types';
import { getDefaultPiAgentDir } from '../sdk/piRuntimePaths';
import type {
  BridgeRequest,
  BridgeResponse,
  PiContextUsage,
  PiModelInfo,
  PiSessionStats,
  PiSkillInfo,
  PiToolApprovalRequest,
  PiToolApprovalResponse,
} from './protocol';

const OBSOLETE_PI_EXTENSION_ENV_PATTERNS = [/^MINIMAX_/i, /^UVX_PATH$/i];

function removeObsoletePiExtensionEnvironment(
  env: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => (
      !OBSOLETE_PI_EXTENSION_ENV_PATTERNS.some((pattern) => pattern.test(key))
    )),
  );
}

type InitPending = {
  resolve: (sessionId: string | null) => void;
  reject: (error: Error) => void;
};

type PromptPending = {
  onEvent: (event: PiEvent) => void;
  resolve: () => void;
  reject: (error: Error) => void;
};

type ListSkillsPending = {
  resolve: (skills: PiSkillInfo[]) => void;
  reject: (error: Error) => void;
};

type ContextUsagePending = {
  resolve: (usage: PiContextUsage | null) => void;
  reject: (error: Error) => void;
};

type SessionStatsPending = {
  resolve: (stats: PiSessionStats) => void;
  reject: (error: Error) => void;
};

type CompactPending = {
  resolve: (result: { tokensBefore: number; estimatedTokensAfter: number | null; summary?: string; usage?: PiContextUsage | null }) => void;
  reject: (error: Error) => void;
};

type ListModelsPending = {
  resolve: (result: { models: PiModelInfo[]; defaultProvider: string | null; defaultModel: string | null }) => void;
  reject: (error: Error) => void;
};

type SetModelPending = {
  resolve: () => void;
  reject: (error: Error) => void;
};

type ResetPending = {
  resolve: () => void;
  reject: (error: Error) => void;
};

export class PiBridgeClient {
  private plugin: PidianPlugin;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = '';
  private sequence = 0;
  private processEnvSignature: string | null = null;
  private readyCwd: string | null = null;
  private activeSessionId: string | null = null;
  private initPending = new Map<string, InitPending>();
  private promptPending = new Map<string, PromptPending>();
  private listSkillsPending = new Map<string, ListSkillsPending>();
  private contextUsagePending = new Map<string, ContextUsagePending>();
  private sessionStatsPending = new Map<string, SessionStatsPending>();
  private compactPending = new Map<string, CompactPending>();
  private listModelsPending = new Map<string, ListModelsPending>();
  private setModelPending = new Map<string, SetModelPending>();
  private resetPending = new Map<string, ResetPending>();
  onInitContextUsage: ((usage: PiContextUsage) => void) | null = null;
  onToolApprovalRequest: ((request: PiToolApprovalRequest) => Promise<PiToolApprovalResponse>) | null = null;

  constructor(plugin: PidianPlugin) {
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
    return new Promise<void>((resolve, reject) => {
      this.resetPending.set(id, { resolve, reject });
      this.send({ type: 'reset', id });
    });
  }

  async listSkills(): Promise<PiSkillInfo[]> {
    await this.ensureProcess();
    const id = this.nextId('list_skills');
    return new Promise<PiSkillInfo[]>((resolve, reject) => {
      this.listSkillsPending.set(id, { resolve, reject });
      this.send({ type: 'list_skills', id });
    });
  }

  async discoverSkills(cwd: string): Promise<PiSkillInfo[]> {
    await this.ensureProcess();
    const id = this.nextId('discover_skills');
    return new Promise<PiSkillInfo[]>((resolve, reject) => {
      this.listSkillsPending.set(id, { resolve, reject });
      this.send({ type: 'discover_skills', id, cwd });
    });
  }

  async getContextUsage(): Promise<PiContextUsage | null> {
    await this.ensureProcess();
    const id = this.nextId('get_context_usage');
    return new Promise<PiContextUsage | null>((resolve, reject) => {
      this.contextUsagePending.set(id, { resolve, reject });
      this.send({ type: 'get_context_usage', id });
    });
  }

  async getSessionStats(): Promise<PiSessionStats> {
    await this.ensureProcess();
    const id = this.nextId('get_session_stats');
    return new Promise<PiSessionStats>((resolve, reject) => {
      this.sessionStatsPending.set(id, { resolve, reject });
      this.send({ type: 'get_session_stats', id });
    });
  }

  async compact(customInstructions?: string): Promise<{ tokensBefore: number; estimatedTokensAfter: number | null; summary?: string; usage?: PiContextUsage | null }> {
    await this.ensureProcess();
    const id = this.nextId('compact');
    return new Promise<{ tokensBefore: number; estimatedTokensAfter: number | null; summary?: string; usage?: PiContextUsage | null }>((resolve, reject) => {
      this.compactPending.set(id, { resolve, reject });
      this.send({ type: 'compact', id, customInstructions });
    });
  }

  async listModels(): Promise<{ models: PiModelInfo[]; defaultProvider: string | null; defaultModel: string | null }> {
    await this.ensureProcess();
    const id = this.nextId('list_models');
    const cwd = getVaultPath(this.plugin.app) ?? undefined;
    return new Promise<{ models: PiModelInfo[]; defaultProvider: string | null; defaultModel: string | null }>((resolve, reject) => {
      this.listModelsPending.set(id, { resolve, reject });
      this.send({ type: 'list_models', id, cwd });
    });
  }

  async setModel(provider: string, modelId: string): Promise<void> {
    await this.ensureProcess();
    const id = this.nextId('set_model');
    const cwd = getVaultPath(this.plugin.app) ?? undefined;
    return new Promise<void>((resolve, reject) => {
      this.setModelPending.set(id, { resolve, reject });
      this.send({ type: 'set_model', id, provider, modelId, cwd });
    });
  }

  dispose(): void {
    this.handleProcessExit(new Error('PI bridge disposed'));
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  private async ensureProcess(): Promise<void> {
    const { env, signature } = this.buildBridgeEnvironment();

    if (this.proc && !this.proc.killed) {
      if (this.processEnvSignature === signature) {
        return;
      }

      this.handleProcessExit(new Error('PI bridge restarting due to environment changes'));
      this.proc.kill();
      this.proc = null;
    }

    const scriptPath = this.resolveBridgeScriptPath();
    const nodePath = findNodeExecutable() ?? 'node';

    const child = spawn(nodePath, [scriptPath], {
      cwd: process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.proc = child;
    this.processEnvSignature = signature;
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

  private buildBridgeEnvironment(): {
    env: Record<string, string>;
    signature: string;
  } {
    const customEnv = removeObsoletePiExtensionEnvironment(
      parseEnvironmentVariables(this.plugin.getActiveEnvironmentVariables('pi')),
    );
    const baseEnv = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );

    const env = removeObsoletePiExtensionEnvironment({
      ...baseEnv,
      ...customEnv,
      PATH: getEnhancedPath(customEnv.PATH),
    });

    const signature = JSON.stringify({
      customEnv,
      PATH: env.PATH,
      agentDir: getDefaultPiAgentDir(),
    });

    return { env, signature };
  }

  private resolveBridgeScriptPath(): string {
    const manifestDir = (this.plugin as { manifest?: { dir?: string } }).manifest?.dir;
    const manifestId = (this.plugin as { manifest?: { id?: string } }).manifest?.id ?? 'pidian';
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

    if (message.type === 'list_skills_ok') {
      const pending = this.listSkillsPending.get(message.id);
      if (!pending) {
        return;
      }
      this.listSkillsPending.delete(message.id);
      pending.resolve(message.skills);
      return;
    }

    if (message.type === 'context_usage') {
      const pending = this.contextUsagePending.get(message.id);
      if (pending) {
        this.contextUsagePending.delete(message.id);
        pending.resolve(message.usage);
        return;
      }
      // If no pending request, this is initial context usage from session init
      if (message.usage && this.onInitContextUsage) {
        this.onInitContextUsage(message.usage);
      }
      return;
    }

    if (message.type === 'session_stats') {
      const pending = this.sessionStatsPending.get(message.id);
      if (!pending) {
        return;
      }
      this.sessionStatsPending.delete(message.id);
      pending.resolve(message.stats);
      return;
    }

    if (message.type === 'compact_done') {
      const pending = this.compactPending.get(message.id);
      if (!pending) {
        return;
      }
      this.compactPending.delete(message.id);
      pending.resolve(message.result);
      return;
    }

    if (message.type === 'list_models_ok') {
      const pending = this.listModelsPending.get(message.id);
      if (!pending) {
        return;
      }
      this.listModelsPending.delete(message.id);
      pending.resolve({ models: message.models, defaultProvider: message.defaultProvider, defaultModel: message.defaultModel });
      return;
    }

    if (message.type === 'set_model_ok') {
      const pending = this.setModelPending.get(message.id);
      if (!pending) {
        return;
      }
      this.setModelPending.delete(message.id);
      pending.resolve();
      return;
    }

    if (message.type === 'reset_ok') {
      const pending = this.resetPending.get(message.id);
      if (!pending) {
        return;
      }
      this.resetPending.delete(message.id);
      pending.resolve();
      return;
    }

    if (message.type === 'tool_approval_request') {
      void this.handleToolApprovalRequest(message);
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

        const listSkillsPending = this.listSkillsPending.get(message.id);
        if (listSkillsPending) {
          this.listSkillsPending.delete(message.id);
          listSkillsPending.reject(new Error(message.message));
          return;
        }

        const contextUsagePending = this.contextUsagePending.get(message.id);
        if (contextUsagePending) {
          this.contextUsagePending.delete(message.id);
          contextUsagePending.reject(new Error(message.message));
          return;
        }

        const sessionStatsPending = this.sessionStatsPending.get(message.id);
        if (sessionStatsPending) {
          this.sessionStatsPending.delete(message.id);
          sessionStatsPending.reject(new Error(message.message));
          return;
        }

        const compactPending = this.compactPending.get(message.id);
        if (compactPending) {
          this.compactPending.delete(message.id);
          compactPending.reject(new Error(message.message));
          return;
        }

        const listModelsPending = this.listModelsPending.get(message.id);
        if (listModelsPending) {
          this.listModelsPending.delete(message.id);
          listModelsPending.reject(new Error(message.message));
          return;
        }

        const setModelPending = this.setModelPending.get(message.id);
        if (setModelPending) {
          this.setModelPending.delete(message.id);
          setModelPending.reject(new Error(message.message));
          return;
        }

        const resetPending = this.resetPending.get(message.id);
        if (resetPending) {
          this.resetPending.delete(message.id);
          resetPending.reject(new Error(message.message));
          return;
        }
      }

      console.error('[PiBridgeClient] bridge error:', message.message);
    }
  }

  private async handleToolApprovalRequest(message: Extract<BridgeResponse, { type: 'tool_approval_request' }>): Promise<void> {
    const fallback = {
      decision: 'reject' as const,
      reason: 'No approval handler is available.',
    };
    let response: PiToolApprovalResponse = fallback;

    if (this.onToolApprovalRequest) {
      try {
        response = await this.onToolApprovalRequest({
          approvalId: message.approvalId,
          toolCallId: message.toolCallId,
          toolName: message.toolName,
          input: message.input,
          preview: message.preview,
        });
      } catch (error) {
        response = {
          decision: 'reject',
          reason: error instanceof Error ? error.message : 'Approval request failed.',
        };
      }
    }

    if (!this.proc || !this.proc.stdin.writable) {
      return;
    }

    this.send({
      type: 'tool_approval_response',
      id: this.nextId('tool_approval_response'),
      approvalId: message.approvalId,
      decision: response.decision,
      reason: response.reason,
      editedContent: response.editedContent,
    });
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
    this.processEnvSignature = null;

    for (const [id, pending] of this.initPending.entries()) {
      this.initPending.delete(id);
      pending.reject(error);
    }

    for (const [id, pending] of this.promptPending.entries()) {
      this.promptPending.delete(id);
      pending.reject(error);
    }

    for (const [id, pending] of this.listSkillsPending.entries()) {
      this.listSkillsPending.delete(id);
      pending.reject(error);
    }

    for (const [id, pending] of this.contextUsagePending.entries()) {
      this.contextUsagePending.delete(id);
      pending.reject(error);
    }

    for (const [id, pending] of this.sessionStatsPending.entries()) {
      this.sessionStatsPending.delete(id);
      pending.reject(error);
    }

    for (const [id, pending] of this.compactPending.entries()) {
      this.compactPending.delete(id);
      pending.reject(error);
    }

    for (const [id, pending] of this.listModelsPending.entries()) {
      this.listModelsPending.delete(id);
      pending.reject(error);
    }

    for (const [id, pending] of this.setModelPending.entries()) {
      this.setModelPending.delete(id);
      pending.reject(error);
    }

    for (const [id, pending] of this.resetPending.entries()) {
      this.resetPending.delete(id);
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
