import fs from 'fs';
import path from 'path';

const BRIDGE_PATH = path.resolve(__dirname, '../../scripts/pi-bridge-server.mjs');

describe('pi-bridge-server ensureSession tools contract', () => {
  let bridgeSrc: string;

  beforeAll(() => {
    bridgeSrc = fs.readFileSync(BRIDGE_PATH, 'utf8');
  });

  it('ensureSession does not pass tools to createAgentSession', () => {
    const match = bridgeSrc.match(
      /createAgentSession\(\{[\s\S]*?\}\)/,
    );
    expect(match).not.toBeNull();

    const callBlock = match![0];
    expect(callBlock).not.toContain('tools:');
  });

  it('ensureSession does not destructure legacy tool names from loadSdk', () => {
    const ensureMatch = bridgeSrc.match(
      /async function ensureSession[\s\S]*?await loadSdk\(\)[\s\S]*?\};/,
    );
    if (!ensureMatch) {
      return;
    }

    const block = ensureMatch[0];
    const legacyNames = [
      'readTool',
      'bashTool',
      'editTool',
      'writeTool',
      'grepTool',
      'findTool',
      'lsTool',
    ];

    for (const name of legacyNames) {
      expect(block).not.toContain(name);
    }
  });

  it('no file-level references to legacy tool variable names', () => {
    const legacyAssignments = [
      /\breadTool\b/,
      /\bbashTool\b/,
      /\beditTool\b/,
      /\bwriteTool\b/,
      /\bgrepTool\b/,
      /\bfindTool\b/,
      /\blsTool\b/,
    ];

    for (const pattern of legacyAssignments) {
      expect(pattern.test(bridgeSrc)).toBe(false);
    }
  });
});
