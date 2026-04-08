const mockSession = {
  sessionId: 'test-session-id',
  subscribe: jest.fn(() => jest.fn()),
  prompt: jest.fn(() => Promise.resolve()),
  abort: jest.fn(() => Promise.resolve()),
  state: { messages: [] },
  messages: [],
};

const mockCreateAgentSession = jest.fn(() =>
  Promise.resolve({
    session: mockSession,
    extensionsResult: { extensions: [], loadedCount: 0, errors: [] },
  }),
);

jest.mock('@/utils/path', () => ({
  getVaultPath: jest.fn(() => '/test/vault'),
}));

jest.mock(
  '/Users/zl-q/.nvm/versions/node/v24.14.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/index.js',
  () => ({
    createAgentSession: mockCreateAgentSession,
    readTool: { name: 'read' },
    bashTool: { name: 'bash' },
    grepTool: { name: 'grep' },
    findTool: { name: 'find' },
    lsTool: { name: 'ls' },
    editTool: { name: 'edit' },
    writeTool: { name: 'write' },
    DefaultResourceLoader: jest.fn(),
    SettingsManager: { inMemory: jest.fn(() => ({})) },
  }),
  { virtual: true },
);

export { mockCreateAgentSession,mockSession };
