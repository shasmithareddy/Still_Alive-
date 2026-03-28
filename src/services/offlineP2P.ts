import Peer, { DataConnection } from 'peerjs';

export interface P2PMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  type: 'chat' | 'sos' | 'system';
}

type MessageCallback = (msg: P2PMessage) => void;
type PeerCallback = (peerId: string) => void;
type StatusCallback = (status: string) => void;

/**
 * Offline P2P Chat Service
 * Pure peer-to-peer communication without backend server
 * Uses PeerJS default cloud or local network discovery
 */
class OfflineP2PService {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private myPeerId: string = '';
  private username: string = '';
  private messageCallbacks: MessageCallback[] = [];
  private peerCallbacks: PeerCallback[] = [];
  private statusCallbacks: StatusCallback[] = [];
  private messageHistory: P2PMessage[] = [];

  /**
   * Initialize peer with enhanced STUN/TURN for offline network traversal
   */
  async init(username: string): Promise<string> {
    this.username = username;
    console.log(`🚀 [Offline P2P] Initializing for: ${username}`);

    return new Promise((resolve, reject) => {
      try {
        // Enhanced ICE configuration for offline/LAN scenarios
        const config = {
          config: {
            iceServers: [
              // Google STUN servers (free, widely supported)
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' },
              // Public TURN relay (free, openrelay.metered.ca)
              {
                urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
                username: 'openrelay',
                credential: 'openrelay',
              },
            ]
          }
        };

        this.peer = new Peer(undefined, config);

        this.peer.on('open', (id) => {
          this.myPeerId = id;
          console.log(`✅ [Offline P2P] Peer ID: ${id}`);
          this.addSystemMessage(`📍 Your Node ID: ${id}`);
          this.addSystemMessage('💡 Share this ID with others to connect');
          this.notifyStatus(`Ready (ID: ${id.slice(0, 8)}...)`);
          resolve(id);
        });

        this.peer.on('connection', (conn) => {
          console.log(`📍 [Offline P2P] Incoming connection from ${conn.peer.slice(0, 8)}...`);
          this.handleConnection(conn);
        });

        this.peer.on('error', (err) => {
          console.error(`❌ [Offline P2P] Peer error:`, err);
          this.addSystemMessage(`⚠️ Error: ${err.type} - ${err.message}`);
          this.notifyStatus(`Error: ${err.type}`);
        });

        // Timeout if peer doesn't initialize
        setTimeout(() => {
          if (!this.myPeerId) {
            reject(new Error('Peer initialization timeout'));
          }
        }, 15000);

      } catch (err) {
        console.error('❌ [Offline P2P] Init failed:', err);
        reject(err);
      }
    });
  }

  /**
   * Manually connect to a peer by ID
   */
  async connectToPeer(peerId: string, retryCount = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) {
        reject(new Error('Peer not initialized'));
        return;
      }

      if (this.connections.has(peerId)) {
        console.log(`✓ Already connected to ${peerId.slice(0, 8)}...`);
        resolve();
        return;
      }

      const maxRetries = 3;
      console.log(`🔗 [Offline P2P] Connecting to ${peerId.slice(0, 8)}... (attempt ${retryCount + 1}/${maxRetries + 1})`);
      this.addSystemMessage(`🔗 Connecting to ${peerId.slice(0, 8)}...`);

      let timeout: NodeJS.Timeout;
      let resolved = false;

      try {
        const conn = this.peer.connect(peerId, { reliable: true });

        const onOpen = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          conn.removeListener('error', onError);
          conn.removeListener('close', onClose);

          this.handleConnection(conn);
          console.log(`✅ Successfully connected to ${peerId.slice(0, 8)}...`);
          this.addSystemMessage(`✅ Connected to ${peerId.slice(0, 8)}...`);
          this.peerCallbacks.forEach(cb => cb(peerId));
          resolve();
        };

        const onError = (err: unknown) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          conn.removeListener('open', onOpen);
          conn.removeListener('close', onClose);

          const msg = err instanceof Error ? err.message : String(err);
          console.error(`❌ Connection error for ${peerId.slice(0, 8)}...`, msg);
          this.addSystemMessage(`❌ Connection error: ${msg}`);

          // Retry with exponential backoff
          if (retryCount < maxRetries) {
            const delay = 1000 * Math.pow(2, retryCount);
            console.log(`⏳ Retrying in ${delay}ms...`);
            this.addSystemMessage(`⏳ Retrying in ${delay}ms...`);
            setTimeout(() => {
              this.connectToPeer(peerId, retryCount + 1).then(resolve).catch(reject);
            }, delay);
          } else {
            reject(new Error(`Connection failed after ${maxRetries + 1} attempts: ${err.message}`));
          }
        };

        const onClose = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          console.warn(`⚠️ Connection closed before opening: ${peerId.slice(0, 8)}...`);
          reject(new Error('Connection closed before opening'));
        };

        timeout = setTimeout(() => {
          if (resolved) return;
          resolved = true;
          conn.removeListener('open', onOpen);
          conn.removeListener('error', onError);
          conn.removeListener('close', onClose);
          conn.close();

          console.warn(`⏱️ Connection timeout for ${peerId.slice(0, 8)}...`);
          this.addSystemMessage(`⏱️ Connection timeout`);

          if (retryCount < maxRetries) {
            const delay = 1000 * Math.pow(2, retryCount);
            console.log(`⏳ Retrying in ${delay}ms...`);
            this.addSystemMessage(`⏳ Retrying in ${delay}ms...`);
            setTimeout(() => {
              this.connectToPeer(peerId, retryCount + 1).then(resolve).catch(reject);
            }, delay);
          } else {
            reject(new Error('Connection timeout after max retries'));
          }
        }, 20000); // 20 second timeout per attempt

        conn.once('open', onOpen);
        conn.once('error', onError);
        conn.once('close', onClose);

      } catch (err) {
        console.error('❌ Exception in connectToPeer:', err);
        reject(err);
      }
    });
  }

  private handleConnection(conn: DataConnection) {
    const peerId = conn.peer;
    console.log(`📍 Handling connection with ${peerId.slice(0, 8)}...`);

    conn.on('open', () => {
      if (!this.connections.has(peerId)) {
        this.connections.set(peerId, conn);
        console.log(`✅ Connection opened: ${peerId.slice(0, 8)}...`);
        this.peerCallbacks.forEach(cb => cb(peerId));
      }
    });

    conn.on('data', (data: unknown) => {
      const msg = data as P2PMessage;
      console.log(`📨 Message from ${peerId.slice(0, 8)}...`, msg);
      this.messageHistory.push(msg);
      this.messageCallbacks.forEach(cb => cb(msg));
    });

    conn.on('close', () => {
      console.log(`❌ Connection closed: ${peerId.slice(0, 8)}...`);
      this.connections.delete(peerId);
      this.addSystemMessage(`❌ Disconnected from ${peerId.slice(0, 8)}...`);
    });

    conn.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`⚠️ Connection error: ${peerId.slice(0, 8)}...`, msg);
      this.addSystemMessage(`⚠️ Error from ${peerId.slice(0, 8)}...: ${msg}`);
    });
  }

  sendMessage(content: string) {
    const msg: P2PMessage = {
      id: crypto.randomUUID(),
      sender: this.username,
      content,
      timestamp: Date.now(),
      type: 'chat',
    };

    this.messageHistory.push(msg);
    this.messageCallbacks.forEach(cb => cb(msg));

    // Broadcast to all connected peers
    console.log(`📡 Broadcasting to ${this.connections.size} peer(s)`);
    this.connections.forEach((conn, peerId) => {
      if (conn.open) {
        conn.send(msg);
        console.log(`  → Sent to ${peerId.slice(0, 8)}...`);
      }
    });

    if (this.connections.size === 0) {
      this.addSystemMessage('⚠️ No peers connected - message not sent');
    }
  }

  broadcastSOS() {
    const msg: P2PMessage = {
      id: crypto.randomUUID(),
      sender: this.username,
      content: '🚨 SOS SIGNAL',
      timestamp: Date.now(),
      type: 'sos',
    };

    this.messageHistory.push(msg);
    this.messageCallbacks.forEach(cb => cb(msg));

    console.log(`🚨 Broadcasting SOS to ${this.connections.size} peer(s)`);
    this.connections.forEach((conn) => {
      if (conn.open) conn.send(msg);
    });
  }

  private addSystemMessage(content: string) {
    const msg: P2PMessage = {
      id: crypto.randomUUID(),
      sender: 'SYSTEM',
      content,
      timestamp: Date.now(),
      type: 'system',
    };
    this.messageHistory.push(msg);
    this.messageCallbacks.forEach(cb => cb(msg));
  }

  private notifyStatus(status: string) {
    this.statusCallbacks.forEach(cb => cb(status));
  }

  // Event subscriptions
  onMessage(cb: MessageCallback) {
    this.messageCallbacks.push(cb);
    return () => {
      this.messageCallbacks = this.messageCallbacks.filter(c => c !== cb);
    };
  }

  onPeerConnected(cb: PeerCallback) {
    this.peerCallbacks.push(cb);
    return () => {
      this.peerCallbacks = this.peerCallbacks.filter(c => c !== cb);
    };
  }

  onStatusChange(cb: StatusCallback) {
    this.statusCallbacks.push(cb);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(c => c !== cb);
    };
  }

  // Getters
  getPeerId() { return this.myPeerId; }
  getUsername() { return this.username; }
  getConnectedPeers() { return Array.from(this.connections.keys()); }
  getMessageHistory() { return [...this.messageHistory]; }

  disconnect() {
    console.log('🛑 Disconnecting...');
    this.connections.forEach(conn => conn.close());
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}

export const offlineP2P = new OfflineP2PService();
