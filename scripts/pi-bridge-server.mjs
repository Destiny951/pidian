import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const DEFAULT_PI_SDK_PATH = '/Users/zl-q/.nvm/versions/node/v24.14.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/index.js';
const DEFAULT_AGENT_DIR = `${process.env.HOME ?? ''}/.pi/agent`;

let sdkPromise = null;
let session = null;
let sessionCwd = null;

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function loadSdk() {
  if (sdkPromise) {
    return sdkPromise;
  }

  sdkPromise = (async () => {
    try {
      return await import('@mariozechner/pi-coding-agent');
    } catch {
      const sdkPath = process.env.PI_SDK_PATH || DEFAULT_PI_SDK_PATH;
      const sdkUrl = sdkPath.startsWith('file://') ? sdkPath : pathToFileURL(sdkPath).href;
      return import(sdkUrl);
    }
  })();

  return sdkPromise;
}

async function ensureSession(cwd, requestedSessionId = null) {

  if (
    session
    && sessionCwd === cwd
    && (requestedSessionId == null || session.sessionId === requestedSessionId)
  ) {
    return session;
  }

  const {
    SessionManager,
    DefaultResourceLoader,
    SettingsManager,
    bashTool,
    createAgentSession,
    editTool,
    findTool,
    getDefaultSessionDir,
    grepTool,
    lsTool,
    readTool,
    writeTool,
  } = await loadSdk();

  if (session) {
    try {
      await session.abort();
    } catch {
      // no-op
    }
  }

  const agentDir = process.env.PI_AGENT_DIR || DEFAULT_AGENT_DIR;
  let resourceLoader;

  if (DefaultResourceLoader && SettingsManager?.inMemory) {
    try {
      const settingsManager = SettingsManager.inMemory();
      resourceLoader = new DefaultResourceLoader({
        cwd,
        agentDir,
        settingsManager,
      });
      await resourceLoader.reload();
    } catch {
      resourceLoader = undefined;
    }
  }

  let sessionManager;
  if (requestedSessionId) {
    try {
      const sessionDir = typeof getDefaultSessionDir === 'function'
        ? getDefaultSessionDir(cwd, agentDir)
        : undefined;
      const sessions = await SessionManager.list(cwd, sessionDir);
      const matched = sessions.find((entry) => entry.id === requestedSessionId);
      if (matched?.path) {
        sessionManager = SessionManager.open(matched.path, sessionDir, cwd);
      }
    } catch {
      // ignore lookup failures and fall back to creating a new session
    }
  }

  const created = await createAgentSession({
    cwd,
    agentDir,
    ...(sessionManager ? { sessionManager } : {}),
    ...(resourceLoader ? { resourceLoader } : {}),
    tools: [readTool, bashTool, grepTool, findTool, lsTool, editTool, writeTool],
  });

  session = created.session;
  sessionCwd = cwd;
  return session;
}

async function handleInit(message) {
  if (!message.cwd || typeof message.cwd !== 'string') {
    write({ type: 'error', id: message.id, message: 'Missing cwd in init request' });
    return;
  }

  try {
    await ensureSession(message.cwd, message.sessionId);
    write({ type: 'init_ok', id: message.id, sessionId: session?.sessionId ?? null });
  } catch (error) {
    write({ type: 'error', id: message.id, message: toErrorMessage(error) });
  }
}

async function handlePrompt(message) {
  if (!session) {
    write({ type: 'error', id: message.id, message: 'Session not initialized. Send init first.' });
    return;
  }

  let unsubscribe = null;
  let sawAgentEnd = false;

  try {
    unsubscribe = session.subscribe((event) => {
      if (event?.type === 'agent_end') {
        sawAgentEnd = true;
      }
      write({ type: 'prompt_event', id: message.id, event });
    });

    await session.prompt(message.prompt);

    if (!sawAgentEnd) {
      write({ type: 'prompt_event', id: message.id, event: { type: 'agent_end' } });
    }
    write({ type: 'prompt_done', id: message.id });
  } catch (error) {
    write({ type: 'error', id: message.id, message: toErrorMessage(error) });
  } finally {
    if (unsubscribe) {
      unsubscribe();
    }
  }
}

async function handleCancel(message) {
  try {
    if (session) {
      await session.abort();
    }
    write({ type: 'cancel_ok', id: message.id });
  } catch (error) {
    write({ type: 'error', id: message.id, message: toErrorMessage(error) });
  }
}

async function handleReset(message) {
  try {
    if (session) {
      await session.abort();
    }
    session = null;
    sessionCwd = null;
    write({ type: 'reset_ok', id: message.id });
  } catch (error) {
    write({ type: 'error', id: message.id, message: toErrorMessage(error) });
  }
}

async function handleListSkills(message) {
  if (!session) {
    write({ type: 'error', id: message.id, message: 'Session not initialized. Send init first.' });
    return;
  }

  try {
    const commands = await session.getCommands();
    const skills = commands
      .filter((cmd) => cmd.source === 'skill')
      .map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        source: cmd.source,
        sourceInfo: {
          path: cmd.sourceInfo?.path,
        },
      }));
    write({ type: 'list_skills_ok', id: message.id, skills });
  } catch (error) {
    write({ type: 'error', id: message.id, message: toErrorMessage(error) });
  }
}

async function handleDiscoverSkills(message) {
  if (!message.cwd || typeof message.cwd !== 'string') {
    write({ type: 'error', id: message.id, message: 'Missing cwd in discover_skills request' });
    return;
  }

  try {
    const sdk = await loadSdk();
    const { DefaultResourceLoader, SettingsManager, loadSkills } = sdk;

    const agentDir = process.env.PI_AGENT_DIR || DEFAULT_AGENT_DIR;
    let resourceLoader;

    if (DefaultResourceLoader && SettingsManager?.inMemory) {
      try {
        const settingsManager = SettingsManager.inMemory();
        resourceLoader = new DefaultResourceLoader({
          cwd: message.cwd,
          agentDir,
          settingsManager,
        });
        await resourceLoader.reload();
      } catch {
        resourceLoader = undefined;
      }
    }

    let skills = [];
    if (resourceLoader) {
      const result = resourceLoader.getSkills();
      skills = result.skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        source: 'skill',
        sourceInfo: {
          path: skill.filePath,
        },
      }));
    } else {
      const result = await loadSkills({
        cwd: message.cwd,
        agentDir,
      });
      skills = result.skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        source: 'skill',
        sourceInfo: {
          path: skill.filePath,
        },
      }));
    }

    write({ type: 'list_skills_ok', id: message.id, skills });
  } catch (error) {
    write({ type: 'error', id: message.id, message: toErrorMessage(error) });
  }
}

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    write({ type: 'error', message: 'Invalid JSON request' });
    return;
  }

  if (!message?.type || !message?.id) {
    write({ type: 'error', message: 'Invalid request payload' });
    return;
  }

  switch (message.type) {
    case 'init':
      await handleInit(message);
      break;
    case 'prompt':
      await handlePrompt(message);
      break;
    case 'cancel':
      await handleCancel(message);
      break;
    case 'reset':
      await handleReset(message);
      break;
    case 'list_skills':
      await handleListSkills(message);
      break;
    case 'discover_skills':
      await handleDiscoverSkills(message);
      break;
    default:
      write({ type: 'error', id: message.id, message: `Unknown request type: ${message.type}` });
      break;
  }
});

rl.on('close', async () => {
  if (session) {
    try {
      await session.abort();
    } catch {
      // no-op
    }
  }
  process.exit(0);
});
