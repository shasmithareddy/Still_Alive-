# 🌐 Offline P2P Terminal Chat

Pure peer-to-peer messaging with **no backend server required**. Chat over LAN or Internet directly.

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Run CLI Terminal Chat
Open **first terminal**:
```bash
npx ts-node cli-chat.ts user1
```

Open **second terminal** (same machine or different machine on same network):
```bash
npx ts-node cli-chat.ts user2
```

### 3. Get Peer IDs & Connect

In **first terminal**, type:
```
/myid
```
You'll see:
```
✅ Your Node ID: abc123def456... (full 32+ char ID)
```

Copy this ID and in **second terminal**, type:
```
/connect abc123def456...
```

Then you can chat! Type messages and they'll appear in both terminals.

## Commands

| Command | Purpose |
|---------|---------|
| `/help` | Show all commands |
| `/myid` | Display your node ID |
| `/copyid` | Copy your ID to clipboard |
| `/peers` | List connected peers |
| `/connect <peer-id>` | Connect to a peer |
| `/sos` | Broadcast SOS signal |
| `/clear` | Clear screen |
| `/exit` | Disconnect and exit |

## How It Works

1. **No Backend** - Uses PeerJS for P2P communication
2. **Automatic Discovery** - Find peers in your location zone (if using full app)
3. **Manual Connection** - Share peer IDs for direct 1-to-1 chat
4. **P2P Data Transfer** - All messages sent directly between peers
5. **NAT Traversal** - Uses STUN/TURN servers for connection through firewalls

## Network Modes

### Local Network (Same WiFi/LAN)
```bash
# Terminal 1 (Mac)
npx ts-node cli-chat.ts alice

# Terminal 2 (Phone hotspot or same network)
npx ts-node cli-chat.ts bob
```
→ Get peer IDs and connect manually

### Internet (Different Networks)
Same process - PeerJS handles NAT traversal automatically.

### Pure Offline (LAN only, no internet)
Due to PeerJS limitations, you'll need both clients on same local network and STUN/TURN won't work - direct LAN detection coming soon.

## Troubleshooting

### "Connection timeout"
- Check firewall allows WebRTC
- Ensure both machines can reach STUN servers or same LAN
- Try `/connect` again - it retries 3 times

### "No peers connected"
- Messages are only sent to connected peers
- Connect using `/connect <peer-id>` first

### Can't see peer ID
- Try `/myid` command

## Development

Run tests:
```bash
npm run test
```

Build:
```bash
npm run build
```

Debug mode in web app:
- Type `/debug` in MESH://CHAT terminal

## Tech Stack

- **PeerJS** - WebRTC abstraction for P2P
- **Socket.IO** - (Optional) Signaling server for auto-discovery
- **TypeScript** - Type-safe messaging
- **Node.js CLI** - Pure terminal chat

## Limitations

- TURN relay is free (openrelay.metered.ca) - not guaranteed uptime
- WebRTC needs both peers online at same time
- P2P doesn't persist messages (web app + backend does)

---

**Ready to chat?** Run the commands above and share your peer ID to connect! 🚀
