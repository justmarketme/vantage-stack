#!/usr/bin/env npx tsx
/**
 * Diagnostic: connect to the ConvAI realtime WebSocket exactly like the browser
 * widget (public agent, agent_id only) and check whether the agent sends its
 * greeting / responds. Prints every frame. Read-only.
 *
 * Usage: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/test-realtime.ts
 */

import { resolveIsabelAgentId } from "./isabel-env";

const agentId = resolveIsabelAgentId();
if (!agentId) {
  console.error("Missing NEXT_PUBLIC_ELEVENLABS_AGENT_ID");
  process.exit(1);
}

const url = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`;
console.log("Connecting:", url);

const ws = new WebSocket(url);
let gotAgent = false;

ws.addEventListener("open", () => {
  console.log("✅ WS OPEN");
  ws.send(JSON.stringify({ type: "conversation_initiation_client_data" }));
  // Send a user message after a moment to force a response.
  setTimeout(() => {
    ws.send(JSON.stringify({ type: "user_message", text: "Hi Isabel, can you hear me?" }));
    console.log("→ sent user_message");
  }, 1500);
});

ws.addEventListener("message", (e: MessageEvent) => {
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(typeof e.data === "string" ? e.data : e.data.toString()); } catch { return; }
  const type = String(data.type ?? "");
  if (type === "audio" || type === "ping") return; // skip noise
  const agentResp = (data.agent_response_event as { agent_response?: string } | undefined)?.agent_response;
  console.log("← frame:", type, agentResp ? `:: "${agentResp}"` : "");
  if (type === "agent_response" && agentResp) {
    gotAgent = true;
    console.log("\n✅ AGENT RESPONDED — realtime works.\n");
    ws.close();
  }
});

ws.addEventListener("error", (e: Event) => {
  console.log("❌ WS ERROR:", (e as ErrorEvent).message ?? JSON.stringify(e));
});

ws.addEventListener("close", (e: CloseEvent) => {
  console.log("WS CLOSED code:", e.code, "reason:", e.reason || "(none)");
  console.log(gotAgent ? "RESULT: realtime OK" : "RESULT: NO agent response (realtime broken)");
  process.exit(0);
});

setTimeout(() => {
  if (!gotAgent) {
    console.log("\n⏰ No agent response within 18s.");
    try { ws.close(); } catch { /* noop */ }
    process.exit(0);
  }
}, 18000);
