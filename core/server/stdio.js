const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");

const STATE_FILE = path.resolve(__dirname, "../state.json");

const EMOTIONS = [
  "neutral", "happy", "embarrassed", "sad", "angry", "surprised", "love", "smug",
  "confused", "crying", "excited", "proud", "scared", "sleepy", "thinking", "tired",
  "dead", "disappointed", "disgusted", "facepalm", "laughing", "nervous", "pout",
  "speechless", "wink", "chu"
];

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { emotion: "neutral", line: "", statusLine: "", source: "hook", timestamp: 0 };
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state) + "\n", "utf-8");
}

const server = new McpServer({ name: "mcp-emoticon", version: "1.0.0" });

server.tool(
  "set_emotion",
  "Set Claude's emotion. Use only for bugs/errors (sad, crying, dead), risky ops (nervous), or unexpected complexity (tired, confused).",
  {
    emotion: z.enum(EMOTIONS).describe("Emotion name"),
    line: z.string().optional().describe("Speech bubble text, ~요/~에요 style, max 15 chars"),
  },
  async ({ emotion, line }) => {
    const state = readState();
    const now = Math.floor(Date.now() / 1000);
    state.emotion = emotion;
    if (line !== undefined) state.line = line;
    state.source = "mcp";
    state.timestamp = now;
    writeState(state);
    return { content: [{ type: "text", text: `Emotion set to: ${emotion}` }] };
  }
);

server.tool("get_emotion", "Get the current emotion state", {}, async () => {
  return { content: [{ type: "text", text: JSON.stringify(readState()) }] };
});

server.tool("list_emotions", "List all available emotions", {}, async () => {
  return { content: [{ type: "text", text: EMOTIONS.join(", ") }] };
});

const transport = new StdioServerTransport();
server.connect(transport);
