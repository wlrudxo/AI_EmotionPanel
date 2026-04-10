const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const express = require("express");
const cors = require("cors");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");

const STATE_FILE = path.resolve(__dirname, "../state.json");
const ASSETS_DIR = path.resolve(__dirname, "../../assets");
const DASHBOARD_HTML = path.resolve(__dirname, "../../viewers/web/index.html");
const PORT = 3100;

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

function createServer() {
  const server = new McpServer({
    name: "mcp-emoticon",
    version: "1.0.0",
  });

  // set_emotion: update emotion with MCP source
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
      // preserve existing statusLine
      state.source = "mcp";
      state.timestamp = now;
      writeState(state);
      return { content: [{ type: "text", text: `Emotion set to: ${emotion}` }] };
    }
  );

  // get_emotion: read current state
  server.tool(
    "get_emotion",
    "Get the current emotion state",
    {},
    async () => {
      const state = readState();
      return { content: [{ type: "text", text: JSON.stringify(state) }] };
    }
  );

  // list_emotions: list all available emotions
  server.tool(
    "list_emotions",
    "List all available emotions",
    {},
    async () => {
      return { content: [{ type: "text", text: EMOTIONS.join(", ") }] };
    }
  );

  return server;
}

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Static assets
  app.use("/assets", express.static(ASSETS_DIR));

  // State API
  app.get("/api/state", (_req, res) => {
    res.json(readState());
  });

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Web dashboard
  app.get("/", (_req, res) => {
    res.sendFile(DASHBOARD_HTML);
  });

  // SSE transport
  const transports = {};

  app.get("/sse", async (req, res) => {
    const server = createServer();
    const transport = new SSEServerTransport("/messages", res);
    transports[transport.sessionId] = { server, transport };
    await server.connect(transport);

    res.on("close", () => {
      delete transports[transport.sessionId];
    });
  });

  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId;
    const entry = transports[sessionId];
    if (!entry) {
      res.status(400).json({ error: "Unknown session" });
      return;
    }
    await entry.transport.handlePostMessage(req, res);
  });

  // Streamable HTTP transport
  app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  app.listen(PORT, () => {
    console.log(`Emotion MCP server running on http://localhost:${PORT}`);
    console.log(`  SSE:  GET  http://localhost:${PORT}/sse`);
    console.log(`  HTTP: POST http://localhost:${PORT}/mcp`);
  });
}

main().catch(console.error);
