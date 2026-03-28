# Offline Mode Integration Guide

## Overview

The offline mode implementation provides three operational modes:
- **Online**: Traditional centralized server communication
- **Offline**: Peer-to-peer mesh network using mDNS (no internet required)
- **Hybrid**: Both methods active simultaneously for redundancy

## Architecture

### Services

1. **libp2pMesh.ts** - Core mesh networking
   - Uses libp2p with mDNS discovery
   - Handles peer discovery and connection
   - Manages peer-to-peer message routing

2. **offlineModeManager.ts** - Mode management
   - Switches between online/offline/hybrid modes
   - Handles data synchronization
   - Manages IndexedDB storage for offline data
   - Auto-detects network changes

3. **Components**
   - `OfflineModeToggle` - Mode switcher in header/toolbar
   - `MeshPeerBrowser` - Displays discovered peers
   - `OfflineModeSettings` - Configuration interface

## Integration Steps

### 1. Update App.tsx

```typescript
import { useEffect } from 'react';
import { getOfflineModeManager } from '@/services/offlineModeManager';
import { CommunicationService } from '@/services/communicationService';
import OfflineModeToggle from '@/components/OfflineModeToggle';

function App() {
  useEffect(() => {
    // Initialize offline mode manager
    const offlineManager = getOfflineModeManager();
    const commService = CommunicationService.getInstance(); // Assuming singleton pattern
    
    offlineManager.init(commService).catch(err => {
      console.error('Failed to initialize offline mode:', err);
    });

    // Optional: Start in hybrid mode for better resilience
    // offlineManager.switchMode('hybrid').catch(console.error);
  }, []);

  return (
    <div className="app">
      {/* Add offline mode toggle to header */}
      <header className="header">
        <div className="header-right">
          <OfflineModeToggle />
        </div>
      </header>

      {/* Rest of app */}
    </div>
  );
}

export default App;
```

### 2. Update Communication Service

Modify `src/services/communicationService.ts` to support offline mode:

```typescript
import { getOfflineModeManager } from './offlineModeManager';

export class CommunicationService {
  // ... existing code ...

  async sendMessage(content: string, type = 'chat') {
    const offlineManager = getOfflineModeManager();
    
    try {
      // Try online method first
      if (this.socket?.connected) {
        this.socket.emit('send-message', {
          content,
          type,
          timestamp: Date.now(),
        });
      } else if (offlineManager.getMode() !== 'online') {
        // Fall back to offline method
        await offlineManager.sendMessage(content, type);
      } else {
        throw new Error('No connection available');
      }
    } catch (error) {
      console.error('Send failed:', error);
      // Store for sync if offline manager available
      await offlineManager.sendMessage(content, type).catch(err => {
        console.error('Offline storage also failed:', err);
      });
    }
  }
}
```

### 3. Add UI Components to Layout

```typescript
// In your main layout component
import OfflineModeToggle from '@/components/OfflineModeToggle';
import MeshPeerBrowser from '@/components/MeshPeerBrowser';
import OfflineModeSettings from '@/components/OfflineModeSettings';

export function AppLayout() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="layout">
      {/* Header with mode toggle */}
      <header className="flex justify-between items-center p-4">
        <h1>Still Alive</h1>
        <OfflineModeToggle />
      </header>

      <main className="flex gap-4">
        {/* Main chat area */}
        <div className="flex-1">
          {/* Chat content */}
        </div>

        {/* Sidebar with mesh peers */}
        <aside className="w-80">
          <MeshPeerBrowser />
        </aside>
      </main>

      {/* Settings dialog */}
      {showSettings && (
        <dialog className="modal">
          <OfflineModeSettings />
          <button onClick={() => setShowSettings(false)}>Close</button>
        </dialog>
      )}
    </div>
  );
}
```

### 4. Configure for Production

**Backend (Render):**
- Uses centralized signaling/relay server
- Handles zone-based message routing
- Provides fallback when mesh unavailable

**Frontend:**
- Automatically falls back to server if mesh fails
- Syncs messages when reconnecting
- Uses server for cross-zone communication

## Usage Scenarios

### Scenario 1: Disaster Response (No Internet)
1. Users switch to **Offline** mode
2. mDNS discovers nearby users automatically
3. Messages broadcast through mesh network
4. When internet returns, auto-sync to server

### Scenario 2: High-Load Event
1. Automatically switches to **Hybrid** mode
2. Reduces server load by using local mesh
3. Maintains sync with server for persistence
4. Seamless fallback if peers disconnect

### Scenario 3: Normal Operation
1. **Online** mode (default)
2. All messages go through centralized server
3. Can manually switch to Hybrid for resilience

## API Reference

### OfflineModeManager

```typescript
import { getOfflineModeManager } from '@/services/offlineModeManager';

const manager = getOfflineModeManager();

// Switch modes
await manager.switchMode('hybrid');

// Send message (auto-routes)
await manager.sendMessage('Hello', 'chat');

// Get status
const mode = manager.getMode();
const isOnline = manager.isNetworkOnline();
const peers = manager.getDiscoveredPeers();

// Subscribe to events
manager.onModeChange((newMode) => {
  console.log('Mode changed to:', newMode);
});

// Get pending messages count
const pending = manager.getPendingMessageCount();
```

### LibP2PMeshService

```typescript
import { getMeshService } from '@/services/libp2pMesh';

const mesh = getMeshService();

// Initialize
await mesh.init('Username');

// Broadcast to all
await mesh.broadcastMessage({
  id: 'msg-123',
  sender: 'user',
  content: 'Hello mesh',
  timestamp: Date.now(),
  type: 'chat',
});

// Get peers
const peers = mesh.getPeers();
const connected = mesh.getConnectedPeers();

// Subscribe to events
mesh.onPeerDiscovered((peer) => {
  console.log('Found peer:', peer.peerId);
});
```

## Testing Locally

### Test Offline Mode:

```bash
# Terminal 1: Start app
npm run dev

# In browser:
# 1. Open Still Alive
# 2. Click offline mode toggle
# 3. Should see mesh initialization logs
# 4. Open app in another browser tab/window
# 5. Should discover each other via mDNS
```

### Test Network Failure:

```bash
# Browser DevTools → Network tab
# 1. Set throttling to "Offline"
# 2. App should auto-switch to offline mode
# 3. Messages queue locally
# 4. Resume network
# 5. Messages auto-sync
```

### Test Synchronization:

```bash
# 1. Start in offline mode
# 2. Send 5 messages
# 3. Switch to hybrid mode
# 4. Messages sync to server
# 5. Check pending count (should reach 0)
```

## Performance Considerations

### Memory Usage
- Each peer consumes ~5KB
- Each cached message ~2KB
- Limit to 1000 messages per DB

### Network Usage
- mDNS: ~100 bytes per discovery
- Message overhead: ~200 bytes per message
- No internet data in offline mode

### CPU Usage
- mDNS polling: Low impact (20s interval)
- Peer management: Event-driven
- Memory cleanup: Automatic per 5 minutes

## Troubleshooting

### Peers Not Discovered
```
✅ Check: Same WiFi network?
✅ Check: Network allows multicast?
✅ Check: Firewall not blocking mDNS (port 5353)?
```

### Messages Not Syncing
```
✅ Check: IndexedDB enabled?
✅ Check: Sufficient storage quota?
✅ Check: Sync on reconnect enabled?
```

### High CPU Usage
```
✅ Reduce mDNS polling interval
✅ Clear old peers cache
✅ Reduce PeerJS connection attempts
```

## Future Enhancements

1. **Mobile Support**
   - React Native adaptation
   - Bluetooth mesh discovery
   - Background sync

2. **Enhanced Reliability**
   - Message deduplication
   - Conflict resolution
   - Better error recovery

3. **UX Improvements**
   - Auto-mode suggestions
   - Network map visualization
   - Advanced analytics

4. **Security**
   - End-to-end encryption
   - Peer verification
   - DoS protection

## Dependencies

All dependencies already installed:
- `libp2p` - P2P networking
- `@libp2p/mdns` - mDNS discovery
- `@libp2p/noise` - Encryption
- `@libp2p/tcp` - Transport
- `@libp2p/mplex` - Stream multiplexing

No additional npm packages required!
