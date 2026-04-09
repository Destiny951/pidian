import type { PiEvent } from '../adapters/types';

export interface PiSkillInfo {
  name: string;
  description?: string;
  source: 'extension' | 'prompt' | 'skill';
  sourceInfo?: {
    path?: string;
  };
}

export type BridgeRequest =
  | { type: 'init'; id: string; cwd: string; sessionId?: string }
  | { type: 'prompt'; id: string; prompt: string }
  | { type: 'cancel'; id: string }
  | { type: 'reset'; id: string }
  | { type: 'list_skills'; id: string }
  | { type: 'discover_skills'; id: string; cwd: string };

export type BridgeResponse =
  | { type: 'init_ok'; id: string; sessionId: string | null }
  | { type: 'prompt_event'; id: string; event: PiEvent }
  | { type: 'prompt_done'; id: string }
  | { type: 'cancel_ok'; id: string }
  | { type: 'reset_ok'; id: string }
  | { type: 'list_skills_ok'; id: string; skills: PiSkillInfo[] }
  | { type: 'error'; id?: string; message: string };
