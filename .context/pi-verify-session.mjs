/**
 * PI Session Lifecycle Verification Script
 * 
 * Tests what we DON'T yet know about the PI SDK:
 * 1. Multi-turn history — does session.state.messages accumulate across prompt() calls?
 * 2. cancel/abort — does session.abort() work?
 * 3. continueSession — does it exist and work?
 * 4. session.prompt() with custom ResourceLoader — does systemPrompt get used?
 * 5. session.messages vs session.state.messages — what's the difference?
 * 6. Inline edit — can we use custom system prompt via ResourceLoader?
 */

const PI_PATH = "/Users/zl-q/.nvm/versions/node/v24.14.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/index.js";
const path = await import("path");

const vaultPath = "/Users/zl-q/Library/Mobile Documents/iCloud~md~obsidian/Documents/project_di";
const agentDir = path.join(process.env.HOME || "", ".pi/agent");

async function main() {
  console.log("=== PI Session Lifecycle Verification ===\n");
  console.log(`vault: ${vaultPath}`);
  console.log(`agentDir: ${agentDir}\n`);

  const { 
    createAgentSession, 
    readTool, grepTool, findTool, lsTool, bashTool,
    DefaultResourceLoader,
    SettingsManager,
  } = await import(PI_PATH);

  // Test 1: Multi-turn history
  console.log("=== Test 1: Multi-turn History ===");
  try {
    const { session } = await createAgentSession({
      cwd: vaultPath,
      agentDir,
      tools: [readTool, grepTool, findTool, lsTool, bashTool],
    });

    let msgCount0 = session.state.messages.length;
    console.log(`  Initial messages: ${msgCount0}`);

    session.subscribe((event) => {
      if (event.type === "message_update") {
        const sub = event.assistantMessageEvent;
        if (sub?.type === "text_delta") {
          process.stdout.write(sub.delta);
        }
      }
      if (event.type === "message_end") process.stdout.write("\n");
    });

    console.log("  Turn 1: sending 'What file am I looking at? Reply with just the filename.'");
    await session.prompt("What file am I looking at? Reply with just the filename.");
    
    const msgCount1 = session.state.messages.length;
    console.log(`  After turn 1: ${msgCount1} messages`);
    console.log(`  Message roles: ${session.state.messages.map(m => m.role).join(", ")}`);

    console.log("\n  Turn 2: sending 'What was my question?'");
    await session.prompt("What was my question? Reply with just your answer.");
    
    const msgCount2 = session.state.messages.length;
    console.log(`  After turn 2: ${msgCount2} messages`);
    console.log(`  ✓ History ${msgCount2 > msgCount1 ? "ACCUMULATES" : "RESETS"} across turns`);
    console.log();
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}\n`);
  }

  // Test 2: Cancel/Abort
  console.log("=== Test 2: Cancel/Abort ===");
  try {
    const { session } = await createAgentSession({
      cwd: vaultPath,
      agentDir,
      tools: [readTool, grepTool, findTool, lsTool, bashTool],
    });

    let done = false;
    session.subscribe((event) => {
      if (event.type === "agent_end") done = true;
    });

    console.log("  Sending a long streaming request...");
    const promptPromise = session.prompt("Count to 100 slowly. Output one number per line.");

    // Wait a bit then abort
    await new Promise(r => setTimeout(r, 500));
    console.log("  Calling session.abort()...");
    await session.abort();
    
    await promptPromise.catch(() => {});
    
    console.log(`  abort() completed. agent_end received: ${done}`);
    console.log(`  ✓ abort() ${done ? "WORKS" : "may have issues"}\n`);
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}\n`);
  }

  // Test 3: continueSession option
  console.log("=== Test 3: continueSession Option ===");
  try {
    console.log("  Trying createAgentSession({ continueSession: true })...");
    const result = await createAgentSession({
      cwd: vaultPath,
      agentDir,
      continueSession: true,
    });
    console.log(`  ✓ continueSession accepted, sessionId: ${result.session.sessionId}`);
    console.log();
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    console.log("  Note: continueSession may not be in the type definitions but could still work\n");
  }

  // Test 4: Custom system prompt via ResourceLoader
  console.log("=== Test 4: Custom System Prompt via ResourceLoader ===");
  try {
    const customSystemPrompt = "You are a helpful assistant that always starts responses with 'CUSTOM: '.";
    
    const settingsManager = SettingsManager.inMemory();
    const resourceLoader = new DefaultResourceLoader({
      cwd: vaultPath,
      agentDir,
      settingsManager,
      systemPrompt: customSystemPrompt,
      noExtensions: false,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: vaultPath,
      agentDir,
      resourceLoader,
      tools: [readTool, grepTool, findTool, lsTool, bashTool],
    });

    let response = "";
    session.subscribe((event) => {
      if (event.type === "message_update") {
        const sub = event.assistantMessageEvent;
        if (sub?.type === "text_delta") {
          response += sub.delta;
        }
      }
    });

    console.log(`  System prompt set to: "${customSystemPrompt.slice(0, 50)}..."`);
    await session.prompt("Say hello in one word.");

    console.log(`  Response: "${response.trim()}"`);
    if (response.includes("CUSTOM:")) {
      console.log("  ✓ Custom system prompt IS being used!");
    } else {
      console.log("  Note: Cannot confirm if custom system prompt is being used");
      console.log(`  Actual system prompt: "${session.systemPrompt.slice(0, 100)}..."`);
    }
    console.log();
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}\n`);
  }

  // Test 5: Inline edit with custom system prompt
  console.log("=== Test 5: Inline Edit with Custom System Prompt ===");
  try {
    const inlineEditSystemPrompt = `Today is ${new Date().toISOString().split('T')[0]}.

You are Claudian, an expert editor. When asked to edit text, respond with ONLY the replacement wrapped in <replacement> tags.

Example:
Input: translate to French
<editor_selection path="test.md">
Hello world
</editor_selection>

Output: <replacement>Bonjour le monde</replacement>`;

    const settingsManager = SettingsManager.inMemory();
    const resourceLoader = new DefaultResourceLoader({
      cwd: vaultPath,
      agentDir,
      settingsManager,
      systemPrompt: inlineEditSystemPrompt,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: vaultPath,
      agentDir,
      resourceLoader,
      tools: [readTool, grepTool, findTool, lsTool, bashTool],
    });

    let fullResponse = "";
    session.subscribe((event) => {
      if (event.type === "message_update") {
        const sub = event.assistantMessageEvent;
        if (sub?.type === "text_delta") {
          fullResponse += sub.delta;
        }
      }
    });

    const inlinePrompt = `translate to French

<editor_selection path="notes/test.md">
Hello world
</editor_selection>`;

    await session.prompt(inlinePrompt);
    
    console.log(`  Full response: "${fullResponse.trim()}"`);
    
    const hasReplacement = fullResponse.includes("<replacement>");
    console.log(`  ${hasReplacement ? "✓" : "✗"} <replacement> tag ${hasReplacement ? "found" : "NOT found"}`);
    console.log();
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}\n`);
  }

  // Test 6: session.messages vs session.state.messages
  console.log("=== Test 6: session.messages vs session.state.messages ===");
  try {
    const { session } = await createAgentSession({
      cwd: vaultPath,
      agentDir,
      tools: [readTool, grepTool, findTool, lsTool, bashTool],
    });

    session.subscribe(() => {});

    await session.prompt("What is 2+2?");

    console.log(`  session.messages.length: ${session.messages.length}`);
    console.log(`  session.state.messages.length: ${session.state.messages.length}`);
    console.log(`  Are they the same? ${session.messages === session.state.messages ? "SAME REF" : "DIFFERENT"}`);
    console.log();
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}\n`);
  }

  console.log("=== Verification Complete ===");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
