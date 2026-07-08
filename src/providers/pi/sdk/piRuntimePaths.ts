import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

const PI_GLOBAL_PACKAGE_CANDIDATES = [
  ['@earendil-works', 'pi-coding-agent', 'dist', 'index.js'],
  ['@mariozechner', 'pi-coding-agent', 'dist', 'index.js'],
] as const;

let globalNpmRootPromise: Promise<string> | null = null;

function getNpmExecutable(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

async function getGlobalNpmRoot(): Promise<string> {
  if (!globalNpmRootPromise) {
    globalNpmRootPromise = new Promise<string>((resolve, reject) => {
      execFile(getNpmExecutable(), ['root', '-g'], (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        const root = stdout.trim();
        if (!root) {
          reject(new Error('Failed to resolve global npm root for PI SDK.'));
          return;
        }

        resolve(root);
      });
    });
  }

  return globalNpmRootPromise;
}

export function getDefaultPiAgentDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.pi', 'agent');
}

export async function resolvePiSdkUrl(): Promise<string> {
  const globalNpmRoot = await getGlobalNpmRoot();

  for (const segments of PI_GLOBAL_PACKAGE_CANDIDATES) {
    const sdkPath = path.join(globalNpmRoot, ...segments);
    if (fs.existsSync(sdkPath)) {
      return pathToFileURL(sdkPath).href;
    }
  }

  const attempted = PI_GLOBAL_PACKAGE_CANDIDATES
    .map((segments) => path.join(globalNpmRoot, ...segments))
    .join(', ');
  throw new Error(`Could not locate PI SDK. Tried: ${attempted}`);
}
