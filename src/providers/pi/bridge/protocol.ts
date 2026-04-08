import type { PiEvent } from '../adapters/types';

export type BridgeRequest =
  | { type: 'init'; id: string; cwd: string; sessionId?: string }
  | { type: 'prompt'; id: string; prompt: string }
  | { type: 'cancel'; id: string }
  | { type: 'reset'; id: string };

export type BridgeResponse =
  | { type: 'init_ok'; id: string; sessionId: string | null }
  | { type: 'prompt_event'; id: string; event: PiEvent }
  | { type: 'prompt_done'; id: string }
  | { type: 'cancel_ok'; id: string }
  | { type: 'reset_ok'; id: string }
  | { type: 'error'; id?: string; message: string };
