#!/usr/bin/env node

/**
 * Offline P2P Terminal Chat
 * Pure peer-to-peer messaging over LAN/Internet without backend
 * Usage: npx ts-node cli-chat.ts <username>
 */

import readline from 'readline';
import { exec } from 'child_process';
import { offlineP2P } from './src/services/offlineP2P';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

let isReadingInput = true;
let lastPeerIdCopied = '';

const clearScreen = () => {
  console.clear();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🌐 OFFLINE P2P TERMINAL CHAT - No Backend Required');
  console.log('═══════════════════════════════════════════════════════════\n');
};

const printHeader = () => {
  const peerId = offlineP2P.getPeerId();
  const peers = offlineP2P.getConnectedPeers();
  const msgs = offlineP2P.getMessageHistory().length;

  console.log('\n┌─ STATUS ─────────────────────────────────────────────────┐');
  console.log(`│ Node ID:  ${peerId.slice(0, 16).padEnd(50)} │`);
  console.log(`│ Peers:    ${peers.length} connected${' '.repeat(40- (peers.length + ' connected').length)}│`);
  console.log(`│ Messages: ${msgs}${' '.repeat(48 - msgs.toString().length)}│`);
  console.log('└───────────────────────────────────────────────────────────┘\n');
};

const printHelp = () => {
  console.log('\n📖 COMMANDS:');
  console.log('  /connect <peer-id>     Connect to a peer');
  console.log('  /peers                 List connected peers');
  console.log('  /myid                  Show your node ID');
  console.log('  /copyid                Copy your ID to clipboard');
  console.log('  /sos                   Broadcast SOS signal');
  console.log('  /clear                 Clear screen');
  console.log('  /help                  Show this help');
  console.log('  /exit                  Disconnect and exit\n');
};

const showMessage = (sender: string, content: string, timestamp: number) => {
  const time = new Date(timestamp).toLocaleTimeString();
  if (sender === 'SYSTEM') {
    console.log(`\x1b[90m[${time}] \x1b[0m\x1b[36m${content}\x1b[0m`);
  } else {
    console.log(`\x1b[90m[${time}] \x1b[0m\x1b[33m${sender}:\x1b[0m ${content}`);
  }
};

const displayMessageHistory = () => {
  const history = offlineP2P.getMessageHistory();
  history.slice(-20).forEach(msg => {
    showMessage(msg.sender, msg.content, msg.timestamp);
  });
};

const prompt = () => {
  if (!isReadingInput) return;
  process.stdout.write('\n\x1b[92m$\x1b[0m ');
};

async function handleCommand(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    prompt();
    return;
  }

  if (trimmed === '/help') {
    printHelp();
  } else if (trimmed === '/myid') {
    const id = offlineP2P.getPeerId();
    console.log(`\n✅ Your Node ID: \x1b[92m${id}\x1b[0m`);
    lastPeerIdCopied = id;
  } else if (trimmed === '/copyid') {
    const id = offlineP2P.getPeerId();
    // Copy to clipboard (basic implementation)
    if (process.platform === 'win32') {
      exec(`powershell -Command "Add-Content -Path $env:TEMP\\peer.txt -Value '${id}' -Force; Get-Content $env:TEMP\\peer.txt | Set-Clipboard"`);
    } else {
      exec(`echo -n "${id}" | pbcopy || xclip -selection clipboard`);
    }
    console.log(`\n✅ Copied to clipboard: ${id.slice(0, 8)}...`);
  } else if (trimmed === '/peers') {
    const peers = offlineP2P.getConnectedPeers();
    if (peers.length === 0) {
      console.log('\n❌ No peers connected');
    } else {
      console.log(`\n✅ Connected Peers (${peers.length}):`);
      peers.forEach((id, idx) => {
        console.log(`  ${idx + 1}. ${id}`);
      });
    }
  } else if (trimmed === '/clear') {
    clearScreen();
    displayMessageHistory();
  } else if (trimmed === '/sos') {
    offlineP2P.broadcastSOS();
    console.log('\n🚨 SOS BROADCASTED');
  } else if (trimmed.startsWith('/connect ')) {
    const peerId = trimmed.split(' ')[1];
    if (!peerId) {
      console.log('\n❌ Usage: /connect <peer-id>');
    } else {
      try {
        await offlineP2P.connectToPeer(peerId);
      } catch (err: unknown) {
        if (err instanceof Error) {
          console.log(`\n❌ Connection failed: ${err.message}`);
        } else {
          console.log(`\n❌ Connection failed: ${String(err)}`);
        }
      }
    }
  } else if (trimmed === '/exit') {
    console.log('\n👋 Bye!');
    offlineP2P.disconnect();
    rl.close();
    process.exit(0);
  } else {
    // Regular message
    offlineP2P.sendMessage(trimmed);
  }

  prompt();
}

async function main() {
  clearScreen();

  // Get username
  const username = process.argv[2];
  if (!username) {
    console.log('❌ Usage: npx ts-node cli-chat.ts <username>');
    process.exit(1);
  }

  console.log(`🚀 Initializing for user: \x1b[92m${username}\x1b[0m`);

  try {
    const peerId = await offlineP2P.init(username);
    console.log(`✅ Peer initialized: \x1b[92m${peerId}\x1b[0m`);
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error(`❌ Failed to init: ${err.message}`);
    } else {
      console.error(`❌ Failed to init: ${String(err)}`);
    }
    process.exit(1);
  }

  clearScreen();
  printHeader();
  printHelp();

  // Display message history
  offlineP2P.onMessage(msg => {
    if (msg.type === 'system' || msg.sender !== offlineP2P.getUsername()) {
      isReadingInput = false;
      showMessage(msg.sender, msg.content, msg.timestamp);
      prompt();
      isReadingInput = true;
    }
  });

  // Read input
  rl.on('line', async (input) => {
    isReadingInput = false;
    await handleCommand(input);
    isReadingInput = true;
  });

  rl.on('close', () => {
    offlineP2P.disconnect();
    process.exit(0);
  });

  prompt();
}

main();
