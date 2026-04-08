/**
 * PI SDK Verification Script - Read-only Session for Inline Edit
 * 
 * Run with: node /Users/zl-q/Code/claudian/.context/pi-verify-readonly.mjs
 * 
 * Tests:
 * 1. Create session WITHOUT editTool
 * 2. Send inline edit prompt
 * 3. Check if PI returns <replacement> tags
 * 4. Check if PI tries to call edit tool (should fail/not happen)
 */

const PI_PATH = "/Users/zl-q/.nvm/versions/node/v24.14.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/index.js";

async function main() {
  console.log("=== PI Read-only Session Verification ===\n");

  const { createAgentSession, readTool, grepTool, findTool, lsTool, bashTool } = await import(PI_PATH);
  const path = await import("path");

  const vaultPath = "/Users/zl-q/Library/Mobile Documents/iCloud~md~obsidian/Documents/project_di";
  const agentDir = path.join(process.env.HOME || "", ".pi/agent");

  console.log(`vault: ${vaultPath}`);
  console.log(`agentDir: ${agentDir}\n`);

  // Test 1: Session WITH edit tool (normal)
  console.log("=== Test 1: Normal session WITH editTool ===");
  try {
    const { session: normalSession } = await createAgentSession({
      cwd: vaultPath,
      agentDir: agentDir,
      // Default tools include edit
    });
    console.log("✓ Normal session created with default tools");
    
    const normalEvents = [];
    normalSession.subscribe((event) => {
      normalEvents.push(event.type);
    });
    
    await normalSession.prompt("Translate 'Hello world' to French. Reply with ONLY the translation, nothing else.");
    
    console.log("  Events:", normalEvents.filter(e => e.includes('tool') || e === 'agent_end').join(", "));
    console.log("✓ Normal session test done\n");
  } catch (e) {
    console.log("✗ Normal session error:", e.message, "\n");
  }

  // Test 2: Session WITHOUT edit tool (read-only)
  console.log("=== Test 2: Read-only session WITHOUT editTool ===");
  try {
    const { session: readOnlySession } = await createAgentSession({
      cwd: vaultPath,
      agentDir: agentDir,
      tools: [readTool, grepTool, findTool, lsTool, bashTool],  // No editTool!
    });
    console.log("✓ Read-only session created (no editTool)");
    
    const readOnlyEvents = [];
    let textOutput = "";
    readOnlySession.subscribe((event) => {
      readOnlyEvents.push(event.type);
      
      if (event.type === "message_update") {
        const sub = event.assistantMessageEvent;
        if (sub?.type === "text_delta") {
          textOutput += sub.delta;
        }
        if (sub?.type === "toolcall_start") {
          console.log(`  [LLM wants to call tool: ${sub.toolCall?.name}]`);
        }
      }
      
      if (event.type === "tool_execution_start") {
        console.log(`  [TOOL EXECUTE: ${event.toolName}]`);
      }
      if (event.type === "tool_execution_end") {
        console.log(`  [TOOL END: ${event.toolName}]`);
      }
    });
    
    console.log("\n  Sending: 'Translate the word \"book\" to French. Reply with ONLY the word.'\n");
    
    await readOnlySession.prompt("Translate the word 'book' to French. Reply with ONLY the translation, nothing else.");
    
    console.log("\n  Final text output:", textOutput.trim());
    console.log("  Events with tools:", readOnlyEvents.filter(e => e.includes('tool') || e === 'agent_end').join(", "));
    
    // Check if any tool was called
    const toolCalls = readOnlyEvents.filter(e => e === "tool_execution_start");
    if (toolCalls.length > 0) {
      console.log(`\n  ⚠️ WARNING: ${toolCalls.length} tool call(s) were made!`);
    } else {
      console.log("\n  ✓ No tool calls made - read-only session works");
    }
    
    console.log("✓ Read-only session test done\n");
  } catch (e) {
    console.log("✗ Read-only session error:", e.message, "\n");
  }

  // Test 3: Inline edit prompt (read-only session)
  console.log("=== Test 3: Inline edit prompt with <replacement> tag ===");
  try {
    const { session } = await createAgentSession({
      cwd: vaultPath,
      agentDir: agentDir,
      tools: [readTool, grepTool, findTool, lsTool, bashTool],  // No editTool!
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
    
    // Simulate inline edit prompt
    const inlineEditPrompt = `Improve the clarity of this text:

<editor_selection path="test.md">
The quick brown fox jumps over the lazy dog.
</editor_selection>

Return ONLY the improved text wrapped in <replacement> tags. Example: <replacement>improved text</replacement>`;
    
    console.log("\n  Sending inline edit prompt...\n");
    
    await session.prompt(inlineEditPrompt);
    
    console.log("  Full response:", fullResponse.trim());
    
    // Check for replacement tag
    if (fullResponse.includes("<replacement>")) {
      console.log("\n  ✓ <replacement> tag found - inline edit works!");
    } else {
      console.log("\n  ⚠️ No <replacement> tag found");
    }
    
    console.log("✓ Inline edit test done\n");
  } catch (e) {
    console.log("✗ Inline edit error:", e.message, "\n");
  }

  console.log("=== Verification Complete ===");
  process.exit(0);
}

main();
