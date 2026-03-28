#!/usr/bin/env node

import net from 'net';
import readline from 'readline';
import os from 'os';
import https from 'https';
import { io as ClientIO } from "socket.io-client";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

// Web bridge socket
let webSocket = null;

// ========================= Geolocation =========================
async function getLocationBasedRoomId() {
  // ✅ Manual zone override via env var — fastest fix
  if (process.env.ZONE) {
    console.log(`📍 Using manual zone: ${process.env.ZONE}`);
    return { roomId: process.env.ZONE, lat: null, lng: null };
  }

  // ✅ Manual lat/lng override via env var
  if (process.env.LAT && process.env.LNG) {
    const lat = parseFloat(process.env.LAT);
    const lng = parseFloat(process.env.LNG);
    const latZone = Math.floor(lat * 50);
    const lngZone = Math.floor(lng * 50);
    const roomId = `zone-${latZone}-${lngZone}`;
    console.log(`📍 Using manual coords: ${lat}, ${lng}`);
    console.log(`🏠 Zone: ${roomId}`);
    return { roomId, lat, lng };
  }

  return new Promise((resolve) => {
    console.log('🌐 Fetching location from ipapi.co...');

    const req = https.get('https://ipapi.co/json/', { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const location = JSON.parse(data);

          if (location.latitude && location.longitude) {
            const latZone = Math.floor(location.latitude * 50);
            const lngZone = Math.floor(location.longitude * 50);
            const roomId = `zone-${latZone}-${lngZone}`;
            console.log(`📍 Location: ${location.city || '?'}, ${location.country_code || '?'}`);
            console.log(`🗺️  Lat: ${location.latitude.toFixed(4)}, Lng: ${location.longitude.toFixed(4)}`);
            console.log(`🏠 Zone: ${roomId}`);
            resolve({ roomId, lat: location.latitude, lng: location.longitude });
            return;
          }

          console.log('⚠️  Could not detect location.');
          console.log('💡 Tip: ZONE=zone-641-4007 node cli-chat.js <name> server');
          resolve({ roomId: 'zone-global', lat: null, lng: null });
        } catch {
          console.log('⚠️  Failed to parse location response.');
          console.log('💡 Tip: ZONE=zone-641-4007 node cli-chat.js <name> server');
          resolve({ roomId: 'zone-global', lat: null, lng: null });
        }
      });
    });

    req.on('error', (err) => {
      console.log(`⚠️  Location fetch failed: ${err.message}`);
      console.log('💡 Tip: ZONE=zone-641-4007 node cli-chat.js <name> server');
      resolve({ roomId: 'zone-global', lat: null, lng: null });
    });

    req.on('timeout', () => {
      req.destroy();
      console.log('⚠️  Location fetch timed out.');
      console.log('💡 Tip: ZONE=zone-641-4007 node cli-chat.js <name> server');
      resolve({ roomId: 'zone-global', lat: null, lng: null });
    });

    setTimeout(() => resolve({ roomId: 'zone-global', lat: null, lng: null }), 6000);
  });
}

// ========================= CHAT SERVER =========================
class MultiUserChatServer {
  constructor(port = 9999) {
    this.server = null;
    this.rooms = new Map();
    this.myPeerId = '';
    this.username = '';
    this.roomId = '';
    this.port = port;
    this.isServer = false;
    this.serverSocket = null;
  }

  generateId() {
    return `cli-${Math.random().toString(36).substring(2, 18)}`;
  }

  getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  connectWebBridge(roomId) {
    const serverUrl = process.env.SERVER_URL || "http://localhost:3001";
    webSocket = ClientIO(serverUrl, { reconnectionDelay: 1000 });

    webSocket.on("connect", () => {
      console.log(`🌐 Web Bridge connected (${serverUrl})`);
      webSocket.emit("register-cli-bridge", {
        room: roomId,
        username: this.username,
        peerId: this.myPeerId,
      });
    });

    webSocket.on("reconnect", () => {
      console.log("🔄 Web Bridge reconnected, re-registering...");
      webSocket.emit("register-cli-bridge", {
        room: roomId,
        username: this.username,
        peerId: this.myPeerId,
      });
    });

    webSocket.on("disconnect", () => {
      console.log("⚠️  Web Bridge disconnected. Reconnecting...");
    });

    webSocket.on("zone-members", (members) => {
      const others = members.filter(m => m.peerId !== this.myPeerId);
      if (others.length > 0) {
        process.stdout.clearLine?.(0);
        process.stdout.cursorTo?.(0);
        console.log(`\n📡 Zone peers (${others.length}): ${others.map(m => `${m.username}(${m.isWebRTC ? 'web' : 'cli'})`).join(', ')}`);
        process.stdout.write('$ ');
      }
    });

    webSocket.on("chat", (data) => {
      if (data.room === this.roomId) {
        if (data.username === this.username) return;
        this.printMessage(`🌐 ${data.username}`, data.msg);
        this.broadcastToRoom(this.roomId, {
          type: "message",
          username: data.username,
          content: data.msg
        });
      }
    });

    webSocket.on("web-user-joined", (data) => {
      this.printMessage('📢 SYSTEM', `Web user joined: ${data.username}`);
    });

    webSocket.on("sos", (data) => {
      this.printMessage('🚨 SOS', `${data.username}: ${data.msg}`);
      this.broadcastToRoom(this.roomId, {
        type: "system",
        content: `🚨 SOS from ${data.username}: ${data.msg}`
      });
    });

    webSocket.on("chat-history", (history) => {
      if (history && history.length > 0) {
        console.log(`\n📜 Last ${Math.min(history.length, 10)} messages from zone:`);
        history.slice(-10).forEach(m => {
          const time = new Date(m.timestamp).toLocaleTimeString();
          console.log(`  [${time}] ${m.username}: ${m.msg}`);
        });
        process.stdout.write('$ ');
      }
    });
  }

  printMessage(sender, content) {
    process.stdout.clearLine?.(0);
    process.stdout.cursorTo?.(0);
    process.stdout.write(`\n${sender}: ${content}\n$ `);
  }

  async startServer(username, roomId) {
    this.username = username;
    this.myPeerId = this.generateId();
    this.roomId = roomId;
    this.isServer = true;

    this.rooms.set(roomId, { clients: new Map() });
    this.connectWebBridge(roomId);

    return new Promise((resolve) => {
      this.server = net.createServer((socket) => {
        this.handleNewClient(socket);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(`\n✅ TCP Server on ${this.getLocalIP()}:${this.port}`);
        console.log(`🏠 Zone: ${roomId}`);
        console.log(`👤 You: ${username} [${this.myPeerId}]`);
        console.log(`\n📡 Web users in zone [${roomId}] will appear here\n`);
        resolve();
      });
    });
  }

  async joinServer(host, port, roomId) {
    this.myPeerId = this.generateId();
    this.roomId = roomId;
    this.isServer = false;

    this.connectWebBridge(roomId);

    return new Promise((resolve, reject) => {
      this.serverSocket = net.createConnection({ host, port: parseInt(port) }, () => {
        console.log(`✅ Connected to TCP server ${host}:${port}`);
        console.log(`🏠 Zone: ${roomId}\n`);

        this.serverSocket.write(JSON.stringify({
          type: 'join',
          peerId: this.myPeerId,
          username: this.username,
          roomId
        }) + '\n');

        resolve();
      });

      this.serverSocket.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'message') {
              this.printMessage(msg.username, msg.content);
            } else if (msg.type === 'system') {
              this.printMessage('📢 SYSTEM', msg.content);
            }
          } catch {}
        }
      });

      this.serverSocket.on('error', (err) => {
        console.error(`❌ TCP Error: ${err.message}`);
        reject(err);
      });

      this.serverSocket.on('close', () => {
        console.log('\n⚠️  TCP connection closed');
      });
    });
  }

  handleNewClient(socket) {
    let peerId = null;
    let username = '';
    let roomId = '';
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);

          if (msg.type === 'join') {
            peerId = msg.peerId;
            username = msg.username;
            roomId = msg.roomId;

            if (!this.rooms.has(roomId)) {
              this.rooms.set(roomId, { clients: new Map() });
            }

            this.rooms.get(roomId).clients.set(peerId, { socket, username });
            this.printMessage('📢 SYSTEM', `${username} joined zone: ${roomId}`);

            this.broadcastToRoom(roomId, {
              type: 'system',
              content: `${username} joined the zone`
            }, peerId);

          } else if (msg.type === 'message') {
            this.handleChatMessage(msg, username, roomId, peerId);
          }
        } catch (err) {
          // Ignore incomplete packets
        }
      }
    });

    socket.on('close', () => {
      if (peerId && roomId && this.rooms.has(roomId)) {
        this.rooms.get(roomId).clients.delete(peerId);
        this.printMessage('📢 SYSTEM', `${username} disconnected`);
        this.broadcastToRoom(roomId, {
          type: 'system',
          content: `${username} disconnected`
        });
      }
    });

    socket.on('error', (err) => {
      console.error(`Socket error (${username}): ${err.message}`);
    });
  }

  handleChatMessage(msg, username, roomId, senderPeerId) {
    this.printMessage(`📨 ${username}`, msg.content);

    this.broadcastToRoom(roomId, {
      type: 'message',
      username,
      content: msg.content
    }, senderPeerId);

    if (webSocket && webSocket.connected) {
      webSocket.emit("chat", {
        username,
        msg: msg.content,
        room: roomId
      });
    }
  }

  broadcastToRoom(roomId, msg, excludePeerId = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const msgStr = JSON.stringify(msg) + '\n';

    for (const [peerId, client] of room.clients.entries()) {
      if (peerId === excludePeerId) continue;
      try {
        client.socket.write(msgStr);
      } catch {}
    }
  }

  sendMessage(content) {
    if (!content.trim()) return;

    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });

    if (this.isServer) {
      process.stdout.clearLine?.(0);
      process.stdout.cursorTo?.(0);
      process.stdout.write(`[${timestamp}] You: ${content}\n$ `);

      this.broadcastToRoom(this.roomId, {
        type: 'message',
        username: this.username,
        content
      });

      if (webSocket && webSocket.connected) {
        webSocket.emit("chat", {
          username: this.username,
          msg: content,
          room: this.roomId
        });
      }

    } else if (this.serverSocket) {
      process.stdout.clearLine?.(0);
      process.stdout.cursorTo?.(0);
      process.stdout.write(`[${timestamp}] You: ${content}\n$ `);

      this.serverSocket.write(JSON.stringify({
        type: 'message',
        username: this.username,
        roomId: this.roomId,
        content
      }) + '\n');

      if (webSocket && webSocket.connected) {
        webSocket.emit("chat", {
          username: this.username,
          msg: content,
          room: this.roomId
        });
      }
    } else {
      console.log('❌ Not connected. Use /join host:port to connect.');
      process.stdout.write('$ ');
    }
  }

  sendSOS(message = "SOS EMERGENCY") {
    this.printMessage('🚨 SOS', 'BROADCASTING...');

    if (webSocket && webSocket.connected) {
      webSocket.emit("sos", {
        username: this.username,
        msg: message,
        room: this.roomId
      });
    }

    this.broadcastToRoom(this.roomId, {
      type: 'system',
      content: `🚨 SOS from ${this.username}: ${message}`
    });
  }
}

// ========================= CLI MAIN =========================
async function main() {
  const username = process.argv[2] || `cli_${Math.random().toString(36).slice(2, 6)}`;
  const mode = process.argv[3] || "server";

  console.log("═══════════════════════════════════════");
  console.log("  STILLALIVE CLI v2.8.1");
  console.log("═══════════════════════════════════════");
  console.log(`👤 Username: ${username}`);
  console.log(`🔧 Mode: ${mode}`);
  console.log("📍 Detecting location...");

  const { roomId } = await getLocationBasedRoomId();

  const chat = new MultiUserChatServer(9999);
  chat.username = username;

  if (mode === "server") {
    await chat.startServer(username, roomId);
    console.log(`Commands:`);
    console.log(`  /sos [message]         - Send emergency SOS`);
    console.log(`  /peers                 - Show TCP + web peers`);
    console.log(`  /zone                  - Show current zone`);
    console.log(`  /quit                  - Exit\n`);
  } else {
    console.log(`Commands:`);
    console.log(`  /join host:port[:zone] - Join a TCP server`);
    console.log(`  /sos [message]         - Send emergency SOS`);
    console.log(`  /zone                  - Show current zone`);
    console.log(`  /quit                  - Exit\n`);
    chat.myPeerId = chat.generateId();
    chat.roomId = roomId;
    chat.connectWebBridge(roomId);
  }

  process.stdout.write('$ ');

  rl.on("line", async (input) => {
    const trimmed = input.trim();

    if (trimmed.startsWith("/join ")) {
      const parts = trimmed.split(" ")[1]?.split(":");
      if (!parts || parts.length < 2) {
        console.log('Usage: /join host:port[:zone]');
        process.stdout.write('$ ');
        return;
      }
      const [host, port, zone = roomId] = parts;
      console.log(`🔗 Connecting to ${host}:${port} in zone ${zone}...`);
      await chat.joinServer(host, port, zone).catch(err => {
        console.error(`❌ Failed: ${err.message}`);
      });

    } else if (trimmed.startsWith("/sos")) {
      const msg = trimmed.slice(4).trim() || "SOS EMERGENCY";
      chat.sendSOS(msg);

    } else if (trimmed === "/zone") {
      console.log(`📍 Current zone: ${chat.roomId}`);
      process.stdout.write('$ ');

    } else if (trimmed === "/peers") {
      if (chat.rooms.has(chat.roomId)) {
        const peers = [...chat.rooms.get(chat.roomId).clients.values()];
        console.log(`📡 TCP Peers (${peers.length}): ${peers.map(p => p.username).join(', ') || 'none'}`);
      }
      const webStatus = webSocket?.connected ? '✅ Connected' : '❌ Disconnected';
      console.log(`🌐 Web Bridge: ${webStatus}`);
      process.stdout.write('$ ');

    } else if (trimmed === "/quit") {
      console.log('\n👋 Goodbye!');
      process.exit(0);

    } else if (trimmed) {
      chat.sendMessage(trimmed);
    } else {
      process.stdout.write('$ ');
    }
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});