/**
 * PI SDK Verification Script - Extension Discovery
 */

const PI_PATH = "/Users/zl-q/.nvm/versions/node/v24.14.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/index.js";

async function main() {
  console.log("=== PI SDK Verification ===\n");

  const { createAgentSession } = await import(PI_PATH);
  const path = await import("path");

  const vaultPath = "/Users/zl-q/Library/Mobile Documents/iCloud~md~obsidian/Documents/project_di";
  const agentDir = path.join(process.env.HOME || "", ".pi/agent");

  console.log(`vault: ${vaultPath}`);
  console.log(`agentDir: ${agentDir}\n`);

  try {
    console.log("1. Creating agent session...");
    const { session, extensionsResult } = await createAgentSession({
      cwd: vaultPath,
      agentDir: agentDir,
    });
    console.log("   ✓ Session created\n");

    console.log("2. Extensions result:");
    console.log(`   extensions.length: ${extensionsResult.extensions.length}`);
    console.log(`   loadedCount: ${extensionsResult.loadedCount}`);
    console.log(`   errors: ${JSON.stringify(extensionsResult.errors)}`);
    
    for (let i = 0; i < extensionsResult.extensions.length; i++) {
      const ext = extensionsResult.extensions[i];
      console.log(`\n   Extension[${i}]:`);
      console.log(`     name: ${ext.name}`);
      console.log(`     enabled: ${ext.enabled}`);
      console.log(`     type: ${typeof ext}`);
      console.log(`     keys: ${Object.keys(ext)}`);
    }

    console.log("\n3. Extension tools (from ext.tools):");
    const ext = extensionsResult.extensions[0];
    console.log(`   type: ${typeof ext.tools}`);
    console.log(`   value: ${JSON.stringify(ext.tools, null, 2)?.slice(0, 500)}`);
    
    console.log("\n4. Agent state tools:");
    const agentTools = session.agent.tools;
    console.log(`   type: ${typeof agentTools}`);
    console.log(`   value: ${JSON.stringify(agentTools, null, 2)?.slice(0, 500)}`);

    console.log("\n5. Sending test message that uses web_fetch...");
    
    const events = [];
    const assistantEvents = [];
    session.subscribe((event) => {
      const eventType = event.type;
      events.push(eventType);
      
      if (eventType === "text_delta") {
        process.stdout.write(event.delta);
      } else if (eventType === "message_update") {
        const subEvent = event.assistantMessageEvent;
        assistantEvents.push(subEvent?.type);
        if (subEvent?.type === "text_delta") {
          process.stdout.write(subEvent.delta);
        }
      } else if (eventType === "tool_execution_start") {
        console.log(`\n   [tool] ${event.toolName} started`);
      } else if (eventType === "tool_execution_end") {
        console.log(`\n   [tool] ${event.toolName} ended (isError: ${event.isError})`);
      }
    });

    console.log("\n   Sending: 'What is the weather in Tokyo?'...\n");
    
    await session.prompt("What is the weather in Tokyo?");

    console.log("\n\n6. Event sequence received:");
    for (let i = 0; i < events.length; i++) {
      console.log(`   [${i}] ${events[i]}`);
    }
    
    console.log("\n6b. AssistantMessageEvent types:");
    for (let i = 0; i < assistantEvents.length; i++) {
      console.log(`   [${i}] ${assistantEvents[i]}`);
    }

    console.log("\n7. Final agent state:");
    const messages = session.agent.state?.messages;
    console.log(`   Messages: ${messages?.length || 0}`);
    
    const toolCalls = (messages || [])
      .filter((m) => m.role === "assistant")
      .flatMap((m) => m.content.filter((c) => c.type === "toolCall"));
    console.log(`   Tool calls: ${toolCalls.length}`);
    for (const tc of toolCalls) {
      console.log(`     - ${tc.name}: ${JSON.stringify(tc.arguments).slice(0, 50)}...`);
    }

    console.log("\n=== Verification Complete ===");
    process.exit(0);

  } catch (error) {
    console.error("\n✗ Error:", error);
    process.exit(1);
  }
}

main();
