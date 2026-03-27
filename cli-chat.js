#!/usr/bin/env node

/**
 * Location-Based Multi-User Chat
 * Users are grouped into rooms based on location
 */

import net from 'net';
import readline from 'readline';
import os from 'os';
import https from 'https';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

// ========================= Geolocation & Room ID =========================

async function getLocationBasedRoomId() {
  return new Promise((resolve) => {
    // Try to get location from IP geolocation API (free, no key required)
    https.get('https://ipapi.co/json/', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const location = JSON.parse(data);
          // Create room ID based on city (or country if city unavailable)
          const roomCity = (location.city || location.country_code || 'Global').toLowerCase().replace(/\s+/g, '_');
          const roomId = `room_${roomCity}`;
          console.log(`📍 Location: ${location.city}, ${location.country_code}`);
          resolve(roomId);
        } catch (err) {
          console.log('📍 Location: Unknown');
          resolve('room_global');
        }
      });
    }).on('error', () => {
      console.log('📍 Location: Unknown');
      resolve('room_global');
    });

    // Timeout after 3 seconds if API is slow
    setTimeout(() => resolve('room_global'), 3000);
  });
}

// ========================= Multi-Room Chat Server =========================

class MultiUserChatServer {
  constructor(port = 9999) {
    this.server = null;
    this.rooms = new Map(); // roomId -> {name, clients: Map(peerId -> {socket, username})}
    this.myPeerId = '';
    this.username = '';
    this.roomId = '';
    this.port = port;
    this.isServer = false;
    this.messageHistory = [];
    this.serverSocket = null;
  }

  generateId() {
    return Math.random().toString(36).substring(2, 24);
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

  async startServer(username, roomId) {
    this.username = username;
    this.myPeerId = this.generateId();
    this.roomId = roomId;
    this.isServer = true;

    // Initialize room
    this.rooms.set(roomId, {
      name: roomId,
      clients: new Map()
    });

    return new Promise((resolve, reject) => {
      const createServerWithErrorRetry = () => {
        this.server = net.createServer((socket) => {
          this.handleNewClient(socket);
        });

        this.server.listen(this.port, '0.0.0.0', () => {
          const localIP = this.getLocalIP();
          console.log(`\n✅ Chat server listening on ${localIP}:${this.port}`);
          console.log(`🏠 Room: ${roomId}\n`);
          this.addSystemMessage(`🌐 Server on ${localIP}:${this.port}`);
          this.addSystemMessage(`🏠 Room: ${roomId}`);
          resolve(this.myPeerId);
        });

        this.server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.log(`⚠️  Port ${this.port} in use, trying ${this.port + 1}...`);
            this.port++;
            this.server.close(() => {
              createServerWithErrorRetry();
            });
          } else {
            console.error(`❌ Server error: ${err.message}`);
            reject(err);
          }
        });
      };

      createServerWithErrorRetry();
    });
  }

  async joinServer(host, port, roomId) {
    this.username = this.username || 'User';
    this.myPeerId = this.generateId();
    this.roomId = roomId;
    this.isServer = false;

    console.log(`\n🔗 Connecting to ${host}:${port} (Room: ${roomId})...\n`);

    return new Promise((resolve, reject) => {
      this.serverSocket = net.createConnection(
        { host, port },
        () => {
          console.log(`✅ Connected to chat server!\n`);
          this.addSystemMessage(`✅ Connected!`);

          const handshake = JSON.stringify({
            type: 'join',
            peerId: this.myPeerId,
            username: this.username,
            roomId: roomId
          });
          this.serverSocket.write(handshake + '\n');

          this.serverSocket.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const msg = JSON.parse(line);
                this.handleServerMessage(msg);
              } catch (err) {}
            }
          });

          this.serverSocket.on('end', () => {
            this.addSystemMessage('👋 Disconnected');
          });

          this.serverSocket.on('error', (err) => {
            this.addSystemMessage(`❌ ${err.message}`);
            reject(err);
          });

          resolve(this.myPeerId);
        }
      );

      this.serverSocket.on('error', (err) => {
        console.error(`❌ ${err.message}\n`);
        reject(err);
      });
    });
  }

  handleNewClient(socket) {
    let clientPeerId = null;
    let clientUsername = 'Unknown';
    let clientRoomId = null;
    let bufferedData = '';

    socket.on('data', (data) => {
      bufferedData += data.toString();
      const lines = bufferedData.split('\n');
      bufferedData = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);

          if (msg.type === 'join' && !clientPeerId) {
            clientPeerId = msg.peerId;
            clientUsername = msg.username;
            clientRoomId = msg.roomId || 'room_global';

            // Create room if it doesn't exist
            if (!this.rooms.has(clientRoomId)) {
              this.rooms.set(clientRoomId, {
                name: clientRoomId,
                clients: new Map()
              });
            }

            // Add client to room
            const room = this.rooms.get(clientRoomId);
            room.clients.set(clientPeerId, { socket, username: clientUsername });

            console.log(`✅ ${clientUsername} joined room: ${clientRoomId}\n`);
            this.addSystemMessage(`✅ ${clientUsername} joined ${clientRoomId}`);

            // Broadcast user joined (only to room members)
            this.broadcastToRoom(clientRoomId, {
              type: 'system',
              content: `👉 ${clientUsername} joined`
            }, clientPeerId);

            // Send room info and user list to new client
            const userList = Array.from(room.clients.values())
              .map(c => c.username)
              .join(', ');
            socket.write(JSON.stringify({
              type: 'roominfo',
              roomId: clientRoomId,
              users: userList
            }) + '\n');

            return;
          }

          if (msg.type === 'message' && clientPeerId) {
            this.handleChatMessage(msg, clientUsername, clientRoomId);
          }
        } catch (err) {}
      }
    });

    socket.on('end', () => {
      if (clientPeerId && clientRoomId) {
        const room = this.rooms.get(clientRoomId);
        if (room) {
          room.clients.delete(clientPeerId);
          console.log(`👋 ${clientUsername} left room: ${clientRoomId}\n`);
          this.addSystemMessage(`👋 ${clientUsername} left`);

          this.broadcastToRoom(clientRoomId, {
            type: 'system',
            content: `👈 ${clientUsername} left`
          });

          // Delete room if empty
          if (room.clients.size === 0) {
            this.rooms.delete(clientRoomId);
          }
        }
      }
    });

    socket.on('error', (err) => {});
  }

  handleServerMessage(msg) {
    if (msg.type === 'message') {
      console.log(`\n📨 ${msg.username}: ${msg.content}`);
    } else if (msg.type === 'system') {
      console.log(`\n📢 ${msg.content}`);
    } else if (msg.type === 'roominfo') {
      console.log(`\n🏠 Room: ${msg.roomId}`);
      console.log(`👥 Users: ${msg.users}`);
    }
  }

  handleChatMessage(msg, username, roomId) {
    console.log(`\n📨 ${username}: ${msg.content}`);
    this.addSystemMessage(`${username}: ${msg.content}`);

    if (this.isServer) {
      this.broadcastToRoom(roomId, {
        type: 'message',
        username,
        content: msg.content
      });
    }
  }

  broadcastToRoom(roomId, msg, excludePeerId = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const msgStr = JSON.stringify(msg) + '\n';
    for (const [peerId, client] of room.clients.entries()) {
      if (excludePeerId === peerId) continue;
      try {
        if (client.socket.writable) {
          client.socket.write(msgStr);
        }
      } catch (err) {}
    }
  }

  sendMessage(content) {
    if (this.isServer) {
      console.log(`\n📡 You: ${content}`);
      const room = this.rooms.get(this.roomId);
      if (room) {
        this.broadcastToRoom(this.roomId, {
          type: 'message',
          username: this.username + ' (Server)',
          content: content
        });
      }
    } else {
      if (this.serverSocket && this.serverSocket.writable) {
        console.log(`\n📤 You: ${content}`);
        this.serverSocket.write(JSON.stringify({
          type: 'message',
          username: this.username,
          roomId: this.roomId,
          content: content
        }) + '\n');
      } else {
        console.log('\n⚠️ Not connected');
      }
    }
  }

  getClientsList() {
    const room = this.rooms.get(this.roomId);
    if (!room) return [];
    return Array.from(room.clients.values()).map(c => c.username);
  }

  getStatus() {
    if (this.isServer) {
      const totalClients = Array.from(this.rooms.values()).reduce((sum, r) => sum + r.clients.size, 0);
      const roomInfo = Array.from(this.rooms.entries())
        .map(([id, room]) => `${id}: ${room.clients.size} users`)
        .join(', ');
      return {
        mode: 'SERVER',
        port: this.port,
        roomId: this.roomId,
        totalClients,
        rooms: roomInfo
      };
    } else {
      return {
        mode: 'CLIENT',
        roomId: this.roomId,
        connected: !!this.serverSocket
      };
    }
  }

  addSystemMessage(content) {
    this.messageHistory.push({ timestamp: new Date(), sender: 'SYSTEM', content });
  }

  async stop() {
    if (this.server) {
      this.server.close();
      for (const room of this.rooms.values()) {
        for (const client of room.clients.values()) {
          client.socket.destroy();
        }
      }
      this.rooms.clear();
    }
    if (this.serverSocket) {
      this.serverSocket.destroy();
    }
  }
}

// ========================= CLI =========================

// Initialize global chat instance (will be re-created with custom port in main() if needed)
global.chat = new MultiUserChatServer(9999);
let isRunning = true;

function printHeader() {
  console.clear();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🌐 MULTI-USER P2P CHAT');
  console.log('═══════════════════════════════════════════════════════════');
}

function printCommands() {
  console.log('\nCOMMANDS:');
  console.log('  /help          - Show this');
  console.log('  /status        - Connection status');
  console.log('  /users         - List users in room');
  console.log('  /rooms         - Show active rooms (server only)');
  console.log('  /join <h:p:r>  - Join room on server (e.g., /join 192.168.1.1:9999:room_tokyo)');
  console.log('  /exit          - Quit');
  console.log('\nUSAGE (Terminal):');
  console.log('  node cli-chat.js username server                    # Default port 9999');
  console.log('  node cli-chat.js username server 10000              # Custom port');
  console.log('  node cli-chat.js username server room_tokyo 10000   # Custom room & port');
  console.log('  node cli-chat.js username                           # Start as client\n');
}

async function handleCommand(input) {
  const trimmed = input.trim();

  if (!trimmed) return prompt();

  if (trimmed === '/help') {
    printHeader();
    printCommands();
  } else if (trimmed === '/status') {
    const status = global.chat.getStatus();
    console.log(`\n📍 Mode: ${status.mode}`);
    console.log(`🏠 Room: ${status.roomId}`);
    if (status.mode === 'SERVER') {
      console.log(`🔗 Port: ${status.port}`);
      console.log(`👥 Total: ${status.totalClients} clients`);
    } else {
      console.log(`🔗 Connected: ${status.connected ? '✅' : '❌'}`);
    }
  } else if (trimmed === '/users') {
    const users = global.chat.getClientsList();
    console.log(`\n👥 Users in ${global.chat.roomId} (${users.length}): ${users.join(', ') || 'None'}`);
  } else if (trimmed === '/rooms') {
    if (global.chat.isServer) {
      const status = global.chat.getStatus();
      console.log(`\n🏠 Rooms:\n${status.rooms}`);
    } else {
      console.log('\n❌ Only server can list rooms');
    }
  } else if (trimmed.startsWith('/join ')) {
    const parts = trimmed.substring(6).trim().split(':');
    if (parts.length >= 2) {
      const host = parts[0];
      const port = parseInt(parts[1]);
      const roomId = parts[2] || 'room_global';
      try {
        await global.chat.joinServer(host, port, roomId);
      } catch (err) {
        console.log(`\n❌ Failed: ${err.message}`);
      }
    } else {
      console.log('\n❌ Usage: /join host:port:roomId');
    }
  } else if (trimmed === '/exit') {
    console.log('\n👋 Bye!\n');
    isRunning = false;
    await global.chat.stop();
    process.exit(0);
  } else {
    global.chat.sendMessage(trimmed);
  }

  prompt();
}

function prompt() {
  if (isRunning) {
    rl.question('$ ', input => handleCommand(input).catch(console.error));
  }
}

async function main() {
  const username = process.argv[2] || 'User';
  const mode = process.argv[3] || 'server';
  
  // Parse port and room arguments
  let customPort = 9999;
  let customRoom = undefined;
  
  // If mode is server, check for port/room arguments
  if (mode === 'server') {
    // Check if argv[4] is a number (port) or string (room)
    if (process.argv[4]) {
      const arg4 = process.argv[4];
      if (!isNaN(arg4)) {
        customPort = parseInt(arg4);
      } else {
        customRoom = arg4;
        // If argv[5] exists and is a number, it's the port
        if (process.argv[5] && !isNaN(process.argv[5])) {
          customPort = parseInt(process.argv[5]);
        }
      }
    }
  }

  printHeader();
  console.log(`\n👤 Username: ${username}`);
  console.log('📍 Getting location...');

  try {
    // Get location-based room ID
    let roomId = customRoom || await getLocationBasedRoomId();
    console.log(`🏠 Room ID: ${roomId}`);

    if (mode === 'server') {
      console.log(`\n📡 Starting SERVER mode on port ${customPort}\n`);
      // Create chat instance with custom port
      global.chat = new MultiUserChatServer(customPort);
      await global.chat.startServer(username, roomId);
    } else {
      global.chat.username = username;
      global.chat.myPeerId = global.chat.generateId();
      global.chat.roomId = roomId;
      console.log('📱 Ready to connect\n');
    }

    printCommands();
    prompt();
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n\n👋 Closed\n');
  await global.chat.stop();
  process.exit(0);
});

main().catch(console.error);
