#!/usr/bin/env node

/**
 * Multi-User P2P Chat Server
 * All users connect to the same port and can chat with everyone
 */

import net from 'net';
import readline from 'readline';
import os from 'os';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

// ========================= Multi-User Chat Server =========================

class MultiUserChatServer {
  constructor(port = 9999) {
    this.server = null;
    this.clients = new Map(); // peerId -> {socket, username}
    this.myPeerId = '';
    this.username = '';
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

  async startServer(username) {
    this.username = username;
    this.myPeerId = this.generateId();
    this.isServer = true;

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleNewClient(socket);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        const localIP = this.getLocalIP();
        console.log(`\n✅ Chat server listening on ${localIP}:${this.port}\n`);
        this.addSystemMessage(`🌐 Server on ${localIP}:${this.port}`);
        resolve(this.myPeerId);
      });

      this.server.on('error', (err) => {
        console.error(`❌ Server error: ${err.message}`);
        reject(err);
      });
    });
  }

  async joinServer(host, port) {
    this.username = this.username || 'User';
    this.myPeerId = this.generateId();
    this.isServer = false;

    console.log(`\n🔗 Connecting to ${host}:${port}...\n`);

    return new Promise((resolve, reject) => {
      this.serverSocket = net.createConnection(
        { host, port },
        () => {
          console.log(`✅ Connected to chat server!\n`);
          this.addSystemMessage(`✅ Connected!`);

          const handshake = JSON.stringify({
            type: 'join',
            peerId: this.myPeerId,
            username: this.username
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
            this.clients.set(clientPeerId, { socket, username: clientUsername });

            console.log(`✅ ${clientUsername} joined\n`);
            this.addSystemMessage(`✅ ${clientUsername} joined`);

            this.broadcastToAll({
              type: 'system',
              content: `👉 ${clientUsername} joined`
            }, clientPeerId);

            const userList = Array.from(this.clients.values())
              .map(c => c.username)
              .join(', ');
            socket.write(JSON.stringify({ type: 'userlist', users: userList }) + '\n');
            return;
          }

          if (msg.type === 'message' && clientPeerId) {
            this.handleChatMessage(msg, clientUsername);
          }
        } catch (err) {}
      }
    });

    socket.on('end', () => {
      if (clientPeerId) {
        this.clients.delete(clientPeerId);
        console.log(`👋 ${clientUsername} left\n`);
        this.addSystemMessage(`👋 ${clientUsername} left`);

        this.broadcastToAll({
          type: 'system',
          content: `👈 ${clientUsername} left`
        });
      }
    });

    socket.on('error', (err) => {});
  }

  handleServerMessage(msg) {
    if (msg.type === 'message') {
      console.log(`\n📨 ${msg.username}: ${msg.content}`);
    } else if (msg.type === 'system') {
      console.log(`\n📢 ${msg.content}`);
    } else if (msg.type === 'userlist') {
      console.log(`\n👥 Users: ${msg.users}`);
    }
  }

  handleChatMessage(msg, username) {
    console.log(`\n📨 ${username}: ${msg.content}`);
    this.addSystemMessage(`${username}: ${msg.content}`);

    if (this.isServer) {
      this.broadcastToAll({
        type: 'message',
        username,
        content: msg.content
      });
    }
  }

  broadcastToAll(msg, excludePeerId = null) {
    const msgStr = JSON.stringify(msg) + '\n';
    for (const [peerId, client] of this.clients.entries()) {
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
      this.broadcastToAll({
        type: 'message',
        username: this.username + ' (Server)',
        content: content
      });
    } else {
      if (this.serverSocket && this.serverSocket.writable) {
        console.log(`\n📤 You: ${content}`);
        this.serverSocket.write(JSON.stringify({
          type: 'message',
          username: this.username,
          content: content
        }) + '\n');
      } else {
        console.log('\n⚠️ Not connected');
      }
    }
  }

  getClientsList() {
    return Array.from(this.clients.values()).map(c => c.username);
  }

  addSystemMessage(content) {
    this.messageHistory.push({ timestamp: new Date(), sender: 'SYSTEM', content });
  }

  getStatus() {
    if (this.isServer) {
      return {
        mode: 'SERVER',
        port: this.port,
        clients: this.clients.size
      };
    } else {
      return {
        mode: 'CLIENT',
        connected: !!this.serverSocket
      };
    }
  }

  async stop() {
    if (this.server) {
      this.server.close();
      for (const [_, client] of this.clients) {
        client.socket.destroy();
      }
      this.clients.clear();
    }
    if (this.serverSocket) {
      this.serverSocket.destroy();
    }
  }
}

// ========================= CLI =========================

const chat = new MultiUserChatServer();
let isRunning = true;

function printHeader() {
  console.clear();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🌐 MULTI-USER P2P CHAT');
  console.log('═══════════════════════════════════════════════════════════');
}

function printCommands() {
  console.log('\nCOMMANDS:');
  console.log('  /help        - Show this');
  console.log('  /status      - Connection status');
  console.log('  /users       - List users');
  console.log('  /join <h:p>  - Join server (e.g., /join 192.168.1.1:9999)');
  console.log('  /exit        - Quit\n');
}

async function handleCommand(input) {
  const trimmed = input.trim();

  if (!trimmed) return prompt();

  if (trimmed === '/help') {
    printHeader();
    printCommands();
  } else if (trimmed === '/status') {
    const status = chat.getStatus();
    console.log(`\n📍 Mode: ${status.mode}`);
    if (status.mode === 'SERVER') {
      console.log(`🔗 Port: ${status.port}`);
      console.log(`👥 Clients: ${status.clients}`);
    } else {
      console.log(`🔗 Connected: ${status.connected ? '✅' : '❌'}`);
    }
  } else if (trimmed === '/users') {
    const users = chat.getClientsList();
    console.log(`\n👥 Users (${users.length}): ${users.join(', ') || 'None'}`);
  } else if (trimmed.startsWith('/join ')) {
    const [host, port] = trimmed.substring(6).trim().split(':');
    if (host && port) {
      try {
        await chat.joinServer(host, parseInt(port));
      } catch (err) {
        console.log(`\n❌ Failed: ${err.message}`);
      }
    }
  } else if (trimmed === '/exit') {
    console.log('\n👋 Bye!\n');
    isRunning = false;
    await chat.stop();
    process.exit(0);
  } else {
    chat.sendMessage(trimmed);
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

  printHeader();
  console.log(`\n👤 Username: ${username}`);

  try {
    if (mode === 'server') {
      console.log('📡 Starting SERVER mode\n');
      await chat.startServer(username);
    } else {
      chat.username = username;
      chat.myPeerId = chat.generateId();
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
  await chat.stop();
  process.exit(0);
});

main().catch(console.error);
