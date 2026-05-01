import { execFile } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

const PI_GLOBAL_PACKAGE_SEGMENTS = ['@mariozechner', 'pi-coding-agent', 'dist', 'index.js'] as const;

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
  const sdkPath = path.join(globalNpmRoot, ...PI_GLOBAL_PACKAGE_SEGMENTS);
  return pathToFileURL(sdkPath).href;
}
