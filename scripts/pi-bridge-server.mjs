import { createInterface } from 'node:readline';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';

const DEFAULT_AGENT_DIR = path.join(os.homedir(), '.pi', 'agent');
const PI_GLOBAL_PACKAGE_SEGMENTS = ['@mariozechner', 'pi-coding-agent', 'dist', 'index.js'];
const DIFF_DIAGONAL = 1;
const DIFF_UP = 2;
const DIFF_LEFT = 3;

let sdkPromise = null;
let compactionModulePromise = null;
let sessionManagerModulePromise = null;
let session = null;
let sessionCwd = null;
let pendingModelOverride = null;
let globalNpmRootPromise = null;
let editDiffModulePromise = null;
let approvalSequence = 0;
const pendingApprovals = new Map();

function getNpmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

async function getGlobalNpmRoot() {
  if (!globalNpmRootPromise) {
    globalNpmRootPromise = new Promise((resolve, reject) => {
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

async function resolvePiSdkUrl() {
  const globalNpmRoot = await getGlobalNpmRoot();
  const sdkPath = path.join(globalNpmRoot, ...PI_GLOBAL_PACKAGE_SEGMENTS);
  return pathToFileURL(sdkPath).href;
}

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
    const sdkUrl = await resolvePiSdkUrl();
    return import(sdkUrl);
  })();

  return sdkPromise;
}

async function loadCompactionModule() {
  if (compactionModulePromise) {
    return compactionModulePromise;
  }

  compactionModulePromise = (async () => {
    const sdkUrl = await resolvePiSdkUrl();
    const basePath = new URL(sdkUrl).pathname;
    const compactionModulePath = path.join(path.dirname(basePath), 'core', 'compaction', 'compaction.js');
    return import(pathToFileURL(compactionModulePath).href);
  })();

  return compactionModulePromise;
}

async function loadSessionManagerModule() {
  if (sessionManagerModulePromise) {
    return sessionManagerModulePromise;
  }

  sessionManagerModulePromise = (async () => {
    const sdkUrl = await resolvePiSdkUrl();
    const basePath = new URL(sdkUrl).pathname;
    const sessionManagerModulePath = path.join(path.dirname(basePath), 'core', 'session-manager.js');
    return import(pathToFileURL(sessionManagerModulePath).href);
  })();

  return sessionManagerModulePromise;
}

async function loadEditDiffModule() {
  if (!editDiffModulePromise) {
    editDiffModulePromise = (async () => {
      const sdkUrl = await resolvePiSdkUrl();
      const basePath = new URL(sdkUrl).pathname;
      const modulePath = path.join(path.dirname(basePath), 'core', 'tools', 'edit-diff.js');
      return import(pathToFileURL(modulePath).href);
    })();
  }

  return editDiffModulePromise;
}

function nextApprovalId() {
  approvalSequence += 1;
  return `approval-${Date.now()}-${approvalSequence}`;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function isEditOrWriteToolName(toolName) {
  return toolName === 'edit' || toolName === 'write';
}

function resolveAgainstCwd(filePath) {
  if (!sessionCwd) {
    throw new Error('Session cwd is not available.');
  }
  return path.isAbsolute(filePath) ? filePath : path.resolve(sessionCwd, filePath);
}

function normalizeEditArgs(args) {
  if (!isRecord(args)) {
    throw new Error('Edit input must be an object.');
  }

  let edits = args.edits;
  if (typeof edits === 'string') {
    try {
      edits = JSON.parse(edits);
    } catch {
      throw new Error('Edit input edits must be an array.');
    }
  }

  if (!Array.isArray(edits) && typeof args.oldText === 'string' && typeof args.newText === 'string') {
    edits = [{ oldText: args.oldText, newText: args.newText }];
  }

  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Error('Edit input edits must contain at least one replacement.');
  }

  const normalizedEdits = edits.map((edit, index) => {
    if (!isRecord(edit) || typeof edit.oldText !== 'string' || typeof edit.newText !== 'string') {
      throw new Error(`Edit input edits[${index}] must include oldText and newText strings.`);
    }
    return { oldText: edit.oldText, newText: edit.newText };
  });

  if (typeof args.path !== 'string' || args.path.length === 0) {
    throw new Error('Edit input path must be a non-empty string.');
  }

  return { path: args.path, edits: normalizedEdits };
}

function getLines(content) {
  return content.split('\n');
}

function buildDiffLines(oldContent, newContent) {
  const oldLines = getLines(oldContent);
  const newLines = getLines(newContent);
  const width = newLines.length + 1;
  const directions = new Uint8Array((oldLines.length + 1) * width);
  let previous = new Uint32Array(width);
  let current = new Uint32Array(width);

  for (let i = 1; i <= oldLines.length; i += 1) {
    for (let j = 1; j <= newLines.length; j += 1) {
      const index = i * width + j;
      if (oldLines[i - 1] === newLines[j - 1]) {
        current[j] = previous[j - 1] + 1;
        directions[index] = DIFF_DIAGONAL;
      } else if (previous[j] > current[j - 1]) {
        current[j] = previous[j];
        directions[index] = DIFF_UP;
      } else {
        current[j] = current[j - 1];
        directions[index] = DIFF_LEFT;
      }
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }

  const diffLines = [];
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    const direction = i > 0 && j > 0 ? directions[i * width + j] : 0;
    if (direction === DIFF_DIAGONAL) {
      diffLines.push({ type: 'equal', text: oldLines[i - 1], oldLineNum: i, newLineNum: j });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || direction === DIFF_LEFT)) {
      diffLines.push({ type: 'insert', text: newLines[j - 1], newLineNum: j });
      j -= 1;
    } else {
      diffLines.push({ type: 'delete', text: oldLines[i - 1], oldLineNum: i });
      i -= 1;
    }
  }

  diffLines.reverse();
  return diffLines;
}

function countDiffStats(diffLines) {
  let added = 0;
  let removed = 0;
  for (const line of diffLines) {
    if (line.type === 'insert') added += 1;
    if (line.type === 'delete') removed += 1;
  }
  return { added, removed };
}

function makePreview(filePath, absolutePath, operation, oldContent, newContent, error) {
  const diffLines = error ? [] : buildDiffLines(oldContent, newContent);
  return {
    filePath,
    absolutePath,
    operation,
    originalContent: oldContent,
    proposedContent: newContent,
    diffLines,
    stats: countDiffStats(diffLines),
    ...(error ? { error } : {}),
  };
}

async function computeEditApprovalPreview(args) {
  const editArgs = normalizeEditArgs(args);
  const absolutePath = resolveAgainstCwd(editArgs.path);

  try {
    const rawContent = await readFile(absolutePath, 'utf-8');
    const helpers = await loadEditDiffModule();
    const { text: content } = helpers.stripBom(rawContent);
    const normalizedContent = helpers.normalizeToLF(content);
    const { baseContent, newContent } = helpers.applyEditsToNormalizedContent(
      normalizedContent,
      editArgs.edits,
      editArgs.path,
    );
    return makePreview(editArgs.path, absolutePath, 'edit', baseContent, newContent);
  } catch (error) {
    return makePreview(editArgs.path, absolutePath, 'edit', '', '', toErrorMessage(error));
  }
}

async function computeWriteApprovalPreview(args) {
  if (!isRecord(args)) {
    throw new Error('Write input must be an object.');
  }
  if (typeof args.path !== 'string' || args.path.length === 0) {
    throw new Error('Write input path must be a non-empty string.');
  }
  if (typeof args.content !== 'string') {
    throw new Error('Write input content must be a string.');
  }

  const absolutePath = resolveAgainstCwd(args.path);
  let originalContent = '';
  let operation = 'create';
  try {
    originalContent = await readFile(absolutePath, 'utf-8');
    operation = 'write';
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      return makePreview(args.path, absolutePath, 'write', '', '', toErrorMessage(error));
    }
  }

  return makePreview(args.path, absolutePath, operation, originalContent, args.content);
}

async function computeToolApprovalPreview(toolName, args) {
  if (toolName === 'edit') {
    return computeEditApprovalPreview(args);
  }
  return computeWriteApprovalPreview(args);
}

function requestToolApproval({ toolCallId, toolName, input, preview }) {
  const approvalId = nextApprovalId();
  write({
    type: 'tool_approval_request',
    id: approvalId,
    approvalId,
    toolCallId,
    toolName,
    input: isRecord(input) ? input : {},
    preview,
  });

  return new Promise((resolve) => {
    pendingApprovals.set(approvalId, { resolve, toolName, filePath: preview.filePath });
  });
}

function rejectPendingApprovals(reason) {
  for (const [approvalId, pending] of pendingApprovals.entries()) {
    pendingApprovals.delete(approvalId);
    pending.resolve({ decision: 'cancel', reason });
  }
}

function handleToolApprovalResponse(message) {
  const pending = pendingApprovals.get(message.approvalId);
  if (!pending) {
    write({ type: 'error', id: message.id, message: `Unknown approval id: ${message.approvalId}` });
    return;
  }

  pendingApprovals.delete(message.approvalId);
  pending.resolve({
    decision: message.decision === 'approve' ? 'approve' : message.decision === 'cancel' ? 'cancel' : 'reject',
    reason: typeof message.reason === 'string' ? message.reason : undefined,
    editedContent: typeof message.editedContent === 'string' ? message.editedContent : undefined,
  });
}

async function hasPreviewSourceChanged(preview) {
  try {
    const currentContent = await readFile(preview.absolutePath, 'utf-8');
    return currentContent !== preview.originalContent;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return preview.operation !== 'create';
    }
    throw error;
  }
}

function applyApprovedContentToToolInput(toolName, input, preview, editedContent) {
  if (typeof editedContent !== 'string') {
    return;
  }

  if (toolName === 'write') {
    input.content = editedContent;
    return;
  }

  input.edits = [{ oldText: preview.originalContent, newText: editedContent }];
  input.oldText = preview.originalContent;
  input.newText = editedContent;
}

async function setSettingsDefaultModel(settingsManager, provider, modelId) {
  if (!settingsManager?.setDefaultModelAndProvider) return;

  settingsManager.setDefaultModelAndProvider(provider, modelId);
  const projectSettings = settingsManager.getProjectSettings?.();
  if (
    projectSettings
    && (Object.prototype.hasOwnProperty.call(projectSettings, 'defaultProvider')
      || Object.prototype.hasOwnProperty.call(projectSettings, 'defaultModel'))
    && settingsManager.saveProjectSettings
  ) {
    settingsManager.saveProjectSettings({
      ...projectSettings,
      defaultProvider: provider,
      defaultModel: modelId,
    });
  }
  await settingsManager.flush?.();
}

function installToolApprovalHook(targetSession) {
  const agent = targetSession?.agent;
  if (!agent || agent.__pidianApprovalHookInstalled) {
    return;
  }

  const existingBeforeToolCall = agent.beforeToolCall?.bind(agent);
  agent.beforeToolCall = async (params) => {
    const existingResult = existingBeforeToolCall ? await existingBeforeToolCall(params) : undefined;
    if (existingResult?.block) {
      return existingResult;
    }

    const toolName = params?.toolCall?.name;
    if (!isEditOrWriteToolName(toolName)) {
      return existingResult;
    }

    const input = isRecord(params.args) ? params.args : {};
    let preview;
    try {
      preview = await computeToolApprovalPreview(toolName, input);
    } catch {
      return existingResult;
    }
    let decision;
    try {
      decision = await requestToolApproval({
        toolCallId: params?.toolCall?.id ?? nextApprovalId(),
        toolName,
        input,
        preview,
      });
    } catch {
      return existingResult;
    }

    if (decision.decision === 'approve') {
      if (await hasPreviewSourceChanged(preview)) {
        return {
          block: true,
          reason: `File changed while waiting for approval: ${preview.filePath}. Ask before trying again.`,
        };
      }
      applyApprovedContentToToolInput(toolName, input, preview, decision.editedContent);
      return existingResult;
    }

    const reason = decision.reason
      || (decision.decision === 'cancel'
        ? 'User cancelled the edit approval.'
        : `User rejected the proposed ${toolName} to ${preview.filePath}.`);
    return { block: true, reason };
  };
  agent.__pidianApprovalHookInstalled = true;
}

async function estimateTokensFromMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  try {
    const helpers = await loadCompactionModule();
    const estimateTokens = helpers?.estimateTokens;
    if (typeof estimateTokens !== 'function') {
      return null;
    }

    let total = 0;
    for (const message of messages) {
      total += estimateTokens(message);
    }

    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

function findLatestCompactionEntry(entries) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i]?.type === 'compaction') {
      return entries[i];
    }
  }
  return null;
}

async function estimateCalibratedTokensForSession(targetSession, rawEstimatedTokens) {
  if (typeof rawEstimatedTokens !== 'number' || !Number.isFinite(rawEstimatedTokens) || rawEstimatedTokens <= 0) {
    return rawEstimatedTokens;
  }

  const branchEntries = targetSession?.sessionManager?.getBranch?.() ?? [];
  const latestCompaction = findLatestCompactionEntry(branchEntries);
  if (!latestCompaction?.parentId || typeof latestCompaction.tokensBefore !== 'number' || latestCompaction.tokensBefore <= 0) {
    return rawEstimatedTokens;
  }

  try {
    const sessionManagerHelpers = await loadSessionManagerModule();
    const preCompactionBranch = targetSession.sessionManager.getBranch(latestCompaction.parentId);
    const preCompactionContext = sessionManagerHelpers.buildSessionContext(preCompactionBranch);
    const preCompactionRawEstimate = await estimateTokensFromMessages(preCompactionContext?.messages ?? []);
    if (
      typeof preCompactionRawEstimate !== 'number'
      || !Number.isFinite(preCompactionRawEstimate)
      || preCompactionRawEstimate <= 0
    ) {
      return rawEstimatedTokens;
    }

    const calibrationRatio = latestCompaction.tokensBefore / preCompactionRawEstimate;
    if (!Number.isFinite(calibrationRatio) || calibrationRatio <= 1) {
      return rawEstimatedTokens;
    }

    const calibrated = Math.round(rawEstimatedTokens * calibrationRatio);
    return Math.max(rawEstimatedTokens, calibrated);
  } catch {
    return rawEstimatedTokens;
  }
}

function calculatePercent(tokens, contextWindow) {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens)) {
    return null;
  }
  if (typeof contextWindow !== 'number' || !Number.isFinite(contextWindow) || contextWindow <= 0) {
    return null;
  }
  return (tokens / contextWindow) * 100;
}

async function resolveContextUsageForSession(targetSession) {
  const sdkUsage = targetSession?.getContextUsage?.();
  if (sdkUsage && sdkUsage.tokens !== null && sdkUsage.percent !== null) {
    return sdkUsage;
  }

  const contextWindow = sdkUsage?.contextWindow
    ?? targetSession?.model?.contextWindow
    ?? targetSession?.agent?.state?.model?.contextWindow
    ?? 0;
  const rawEstimatedTokens = await estimateTokensFromMessages(targetSession?.messages ?? []);
  const estimatedTokens = await estimateCalibratedTokensForSession(targetSession, rawEstimatedTokens);

  return {
    tokens: estimatedTokens,
    contextWindow,
    percent: calculatePercent(estimatedTokens, contextWindow),
  };
}

async function preparePiCompaction(targetSession) {
  const helpers = await loadCompactionModule();
  const pathEntries = targetSession?.sessionManager?.getBranch?.() ?? [];
  const settings = targetSession?.settingsManager?.getCompactionSettings?.()
    ?? helpers.DEFAULT_COMPACTION_SETTINGS;
  const firstBranchEntryId = pathEntries[0]?.id ?? null;

  const isMeaningfulPreparation = (preparation) => {
    if (!preparation) {
      return false;
    }
    if ((preparation.messagesToSummarize?.length ?? 0) > 0) {
      return true;
    }
    if ((preparation.turnPrefixMessages?.length ?? 0) > 0) {
      return true;
    }
    return preparation.firstKeptEntryId !== firstBranchEntryId;
  };

  const buildPreparation = (keepRecentTokens) => helpers.prepareCompaction(pathEntries, {
    ...settings,
    keepRecentTokens,
  });

  const initialPreparation = buildPreparation(settings.keepRecentTokens);
  if (!initialPreparation) {
    return null;
  }
  if (isMeaningfulPreparation(initialPreparation)) {
    return initialPreparation;
  }

  const rawMessageTokens = await estimateTokensFromMessages(targetSession?.messages ?? []);
  const tokensBefore = typeof initialPreparation.tokensBefore === 'number'
    ? initialPreparation.tokensBefore
    : null;

  if (
    rawMessageTokens === null
    || rawMessageTokens <= 0
    || tokensBefore === null
    || tokensBefore <= 0
  ) {
    return initialPreparation;
  }

  let keepRecentTokens = Math.floor(settings.keepRecentTokens * (rawMessageTokens / tokensBefore));
  keepRecentTokens = Math.max(1024, Math.min(settings.keepRecentTokens - 1, keepRecentTokens));

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = buildPreparation(keepRecentTokens);
    if (!candidate) {
      return initialPreparation;
    }
    if (isMeaningfulPreparation(candidate)) {
      return candidate;
    }
    if (keepRecentTokens <= 1024) {
      return candidate;
    }
    keepRecentTokens = Math.max(1024, Math.floor(keepRecentTokens * 0.65));
  }

  return initialPreparation;
}

async function compactPiSession(targetSession, customInstructions) {
  const pathEntries = targetSession?.sessionManager?.getBranch?.() ?? [];
  if (pathEntries.some((entry) => entry?.type === 'compaction')) {
    throw new Error('Already compacted');
  }

  const preparation = await preparePiCompaction(targetSession);
  if (!preparation) {
    const lastEntry = pathEntries[pathEntries.length - 1];
    if (lastEntry?.type === 'compaction') {
      throw new Error('Already compacted');
    }
    throw new Error('Nothing to compact (session too small)');
  }
  if (
    (preparation.messagesToSummarize?.length ?? 0) === 0
    && (preparation.turnPrefixMessages?.length ?? 0) === 0
  ) {
    throw new Error('Nothing to compact meaningfully');
  }

  const helpers = await loadCompactionModule();
  const model = targetSession?.model;
  if (!model) {
    throw new Error('No model selected');
  }

  const auth = await targetSession._getRequiredRequestAuth(model);
  const result = await helpers.compact(
    preparation,
    model,
    auth.apiKey,
    auth.headers,
    customInstructions,
    undefined,
  );

  targetSession.sessionManager.appendCompaction(
    result.summary,
    result.firstKeptEntryId,
    result.tokensBefore,
    result.details,
    false,
  );

  const sessionContext = targetSession.sessionManager.buildSessionContext();
  if (targetSession.agent?.state) {
    targetSession.agent.state.messages = sessionContext.messages;
  }

  return result;
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
    AuthStorage,
    ModelRegistry,
    SessionManager,
    DefaultResourceLoader,
    SettingsManager,
    createAgentSession,
    getDefaultSessionDir,
  } = await loadSdk();

  if (session) {
    try {
      await session.abort();
    } catch {
      // no-op
    }
  }

  const agentDir = DEFAULT_AGENT_DIR;
  const authStorage = AuthStorage?.create?.(path.join(agentDir, 'auth.json'));
  const modelRegistry = ModelRegistry?.create?.(authStorage, path.join(agentDir, 'models.json'));
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

  const modelOverride = pendingModelOverride && modelRegistry?.find
    ? modelRegistry.find(pendingModelOverride.provider, pendingModelOverride.modelId)
    : undefined;
  if (pendingModelOverride && !modelOverride) {
    throw new Error(`Selected PI model is not available: ${pendingModelOverride.provider}/${pendingModelOverride.modelId}`);
  }

  const created = await createAgentSession({
    cwd,
    agentDir,
    ...(authStorage ? { authStorage } : {}),
    ...(modelRegistry ? { modelRegistry } : {}),
    ...(modelOverride ? { model: modelOverride } : {}),
    ...(sessionManager ? { sessionManager } : {}),
    ...(resourceLoader ? { resourceLoader } : {}),
  });

  session = created.session;
  sessionCwd = cwd;
  pendingModelOverride = null;
  installToolApprovalHook(session);
  return session;
}

async function handleInit(message) {
  if (!message.cwd || typeof message.cwd !== 'string') {
    write({ type: 'error', id: message.id, message: 'Missing cwd in init request' });
    return;
  }

  try {
    await ensureSession(message.cwd, message.sessionId);
    
    // Send init_ok first
    write({ type: 'init_ok', id: message.id, sessionId: session?.sessionId ?? null });
    
    // Then send initial context_usage if available (for restored sessions)
    const usage = await resolveContextUsageForSession(session);
    if (usage && usage.tokens !== null) {
      write({
        type: 'context_usage',
        id: message.id,
        usage: {
          tokens: usage.tokens,
          contextWindow: usage.contextWindow,
          percent: usage.percent,
        },
      });
    }
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

    const usage = await resolveContextUsageForSession(session);
    write({
      type: 'prompt_event',
      id: message.id,
      event: {
        type: 'context_usage',
        tokens: usage?.tokens ?? null,
        contextWindow: usage?.contextWindow ?? null,
        percent: usage?.percent ?? null,
      },
    });

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
    rejectPendingApprovals('Stream cancelled while edit approval was pending.');
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
    rejectPendingApprovals('Session reset while edit approval was pending.');
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
    const skills = commands.map((cmd) => ({
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
    const { DefaultResourceLoader, SettingsManager } = sdk;

    const agentDir = DEFAULT_AGENT_DIR;
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

    const commands = [];

    if (resourceLoader) {
      const skillsResult = resourceLoader.getSkills();
      for (const skill of skillsResult.skills) {
        commands.push({
          name: skill.name,
          description: skill.description,
          source: 'skill',
          sourceInfo: { path: skill.filePath },
        });
      }

      const promptsResult = resourceLoader.getPrompts();
      for (const prompt of promptsResult.prompts) {
        commands.push({
          name: prompt.name,
          description: prompt.description,
          source: 'prompt',
          sourceInfo: { path: prompt.filePath },
        });
      }

      const extensionsResult = resourceLoader.getExtensions();
      for (const ext of extensionsResult.commands || []) {
        commands.push({
          name: ext.name,
          description: ext.description,
          source: 'extension',
          sourceInfo: { path: ext.sourceInfo?.path },
        });
      }
    } else {
      const { loadSkills } = sdk;
      const result = await loadSkills({
        cwd: message.cwd,
        agentDir,
      });
      for (const skill of result.skills) {
        commands.push({
          name: skill.name,
          description: skill.description,
          source: 'skill',
          sourceInfo: { path: skill.filePath },
        });
      }
    }

    write({ type: 'list_skills_ok', id: message.id, skills: commands });
  } catch (error) {
    write({ type: 'error', id: message.id, message: toErrorMessage(error) });
  }
}

async function handleGetContextUsage(message) {
  if (!session) {
    write({ type: 'error', id: message.id, message: 'Session not initialized. Send init first.' });
    return;
  }

  try {
    const usage = await resolveContextUsageForSession(session);
    if (!usage) {
      write({ type: 'context_usage', id: message.id, usage: null });
      return;
    }
    write({
      type: 'context_usage',
      id: message.id,
      usage: {
        tokens: usage.tokens,
        contextWindow: usage.contextWindow,
        percent: usage.percent,
      },
    });
  } catch (error) {
    write({ type: 'error', id: message.id, message: toErrorMessage(error) });
  }
}

async function handleGetSessionStats(message) {
  if (!session) {
    write({ type: 'error', id: message.id, message: 'Session not initialized. Send init first.' });
    return;
  }

  try {
    const stats = session.getSessionStats();
    write({
      type: 'session_stats',
      id: message.id,
      stats: {
        tokens: stats.tokens,
        cost: stats.cost,
        contextUsage: stats.contextUsage
          ? {
              tokens: stats.contextUsage.tokens,
              contextWindow: stats.contextUsage.contextWindow,
              percent: stats.contextUsage.percent,
            }
          : undefined,
      },
    });
  } catch (error) {
    write({ type: 'error', id: message.id, message: toErrorMessage(error) });
  }
}

async function handleCompact(message) {
  if (!session) {
    write({ type: 'error', id: message.id, message: 'Session not initialized. Send init first.' });
    return;
  }
  const agentDir = DEFAULT_AGENT_DIR;
  const agentYamlPath = path.join(agentDir, 'agent.yaml');
  let hasAgentYaml = false;
  try {
    hasAgentYaml = fs.existsSync(agentYamlPath);
  } catch {
    // ignore
  }
  
  try {
    const result = await compactPiSession(session, message.customInstructions);
    const postCompactUsage = await resolveContextUsageForSession(session);
    const estimatedTokensAfter = typeof postCompactUsage?.tokens === 'number'
      ? postCompactUsage.tokens
      : await estimateTokensFromMessages(session?.messages ?? []);
    const sdkModel = session?.model;
    const modelId = sdkModel?.id || sdkModel?.modelId || 'unknown';
    
    write({
      type: 'compact_done',
      id: message.id,
      result: {
        tokensBefore: result?.tokensBefore ?? 0,
        estimatedTokensAfter,
        summary: result?.summary,
        usage: postCompactUsage,
        _diagnostics: {
          modelId,
          hasAgentYaml,
          summaryLength: result?.summary?.length ?? 0,
          messagesCount: session?.messages?.length ?? 0,
          firstKeptEntryId: result?.firstKeptEntryId ?? null,
        },
      },
    });
  } catch (error) {
    write({ type: 'error', id: message.id, message: toErrorMessage(error) });
  }
}

async function handleListModels(message) {
  try {
    const sdk = await loadSdk();
    const { ModelRegistry, AuthStorage, SettingsManager } = sdk;

    const agentDir = DEFAULT_AGENT_DIR;
    const authPath = path.join(agentDir, 'auth.json');
    const cwd = typeof message.cwd === 'string' && message.cwd.length > 0
      ? message.cwd
      : sessionCwd ?? process.cwd();
    
    const authStorage = AuthStorage?.create?.(authPath);
    const settingsManager = SettingsManager?.create?.(cwd, agentDir) ?? SettingsManager?.inMemory?.();
    const modelRegistry = ModelRegistry?.create?.(authStorage, path.join(agentDir, 'models.json'));

    // Use getAvailable() to return only models with configured auth
    const models = modelRegistry?.getAvailable?.() ?? [];
    const defaultProvider = settingsManager?.getDefaultProvider?.() ?? null;
    const defaultModel = settingsManager?.getDefaultModel?.() ?? null;

    const formattedModels = models.map((m) => ({
      id: m.id ?? m.modelId,
      name: m.name ?? m.id ?? m.modelId,
      provider: m.provider,
      contextWindow: m.contextWindow ?? 0,
      reasoning: m.reasoning ?? false,
      input: m.input ?? ['text'],
      cost: m.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }));

    write({
      type: 'list_models_ok',
      id: message.id,
      models: formattedModels,
      defaultProvider,
      defaultModel,
    });
  } catch (error) {
    write({ type: 'error', id: message.id, message: toErrorMessage(error) });
  }
}

async function handleSetModel(message) {
  if (!message.provider || !message.modelId) {
    write({ type: 'error', id: message.id, message: 'Missing provider or modelId in set_model request' });
    return;
  }

  try {
    // Update settings file (will be used when session is created)
    const sdk = await loadSdk();
    const { SettingsManager } = sdk;
    const agentDir = DEFAULT_AGENT_DIR;
    const cwd = typeof message.cwd === 'string' && message.cwd.length > 0
      ? message.cwd
      : sessionCwd ?? process.cwd();
    const settingsManager = SettingsManager?.create?.(cwd, agentDir);
    
    await setSettingsDefaultModel(settingsManager, message.provider, message.modelId);
    
    // Also update session's settingsManager if session exists
    await setSettingsDefaultModel(session?.settingsManager, message.provider, message.modelId);
    pendingModelOverride = { provider: message.provider, modelId: message.modelId };
    
    // Destroy current session so it will be recreated with new model
    if (session) {
      try {
        await session.abort();
      } catch {
        // ignore
      }
      session = null;
      sessionCwd = null;
    }
    
    write({ type: 'set_model_ok', id: message.id });
  } catch (error) {
    console.error('[handleSetModel] Error:', error);
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
    case 'get_context_usage':
      await handleGetContextUsage(message);
      break;
    case 'get_session_stats':
      await handleGetSessionStats(message);
      break;
    case 'compact':
      await handleCompact(message);
      break;
    case 'tool_approval_response':
      handleToolApprovalResponse(message);
      break;
    case 'list_models':
      await handleListModels(message);
      break;
    case 'set_model':
      await handleSetModel(message);
      break;
    default:
      write({ type: 'error', id: message.id, message: `Unknown request type: ${message.type}` });
      break;
  }
});

rl.on('close', async () => {
  rejectPendingApprovals('PI bridge closed while edit approval was pending.');
  if (session) {
    try {
      await session.abort();
    } catch {
      // no-op
    }
  }
  process.exit(0);
});
