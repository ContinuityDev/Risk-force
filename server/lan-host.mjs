#!/usr/bin/env node
/**
 * Minimal authoritative LAN host for Risk Force.
 * Run: npm run lan-host
 * Clients connect to ws://<this-machine-lan-ip>:3847
 *
 * Protocol:
 *   Client → { type: "HELLO" | "JOIN", name? } | { type: "ACTION", action }
 *   Server → { type: "STATE", state } | { type: "ERROR", message }
 *
 * The browser still owns the reducer module; for v1 the host mirrors
 * actions from the room owner and broadcasts state snapshots the clients
 * also reduce locally when playing as host-in-browser. This process is a
 * thin relay + optional state mirror so multiple devices stay in sync.
 */
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import os from "node:os";

const PORT = Number(process.env.RISK_FORCE_LAN_PORT ?? 3847);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Risk Force LAN host OK\n");
});

const wss = new WebSocketServer({ server: httpServer });

/** @type {import('ws').WebSocket[]} */
const clients = [];
/** @type {object | null} */
let lastState = null;

function broadcast(obj) {
  const raw = JSON.stringify(obj);
  for (const c of clients) {
    if (c.readyState === 1) c.send(raw);
  }
}

wss.on("connection", (ws) => {
  clients.push(ws);
  if (lastState) {
    ws.send(JSON.stringify({ type: "STATE", state: lastState }));
  }
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(String(data));
      if (msg.type === "STATE_PUSH" && msg.state) {
        lastState = msg.state;
        broadcast({ type: "STATE", state: lastState });
      } else if (msg.type === "ACTION") {
        // Relay action to all peers (including sender) for shared reduce.
        broadcast({ type: "ACTION_RELAY", action: msg.action });
      } else if (msg.type === "HELLO" || msg.type === "JOIN") {
        ws.send(
          JSON.stringify({
            type: "WELCOME",
            peers: clients.length,
            hasState: !!lastState,
          }),
        );
      }
    } catch {
      ws.send(JSON.stringify({ type: "ERROR", message: "Bad message" }));
    }
  });
  ws.on("close", () => {
    const i = clients.indexOf(ws);
    if (i >= 0) clients.splice(i, 1);
  });
});

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const list of Object.values(nets)) {
    for (const n of list ?? []) {
      if (n.family === "IPv4" && !n.internal) out.push(n.address);
    }
  }
  return out;
}

httpServer.listen(PORT, "0.0.0.0", () => {
  const ips = lanAddresses();
  console.log(`Risk Force LAN host on port ${PORT}`);
  if (ips.length) {
    for (const ip of ips) console.log(`  → ws://${ip}:${PORT}`);
  } else {
    console.log(`  → ws://127.0.0.1:${PORT}`);
  }
});
