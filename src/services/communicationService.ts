import Peer, { DataConnection } from 'peerjs';
import { io, Socket } from 'socket.io-client';

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  type: 'chat' | 'sos' | 'location' | 'system';
}

export interface LocationData {
  lat: number;
  lng: number;
  sender: string;
  timestamp: number;
}

export interface SOSData {
  sender: string;
  location?: { lat: number; lng: number };
  timestamp: number;
}

type MessageCallback = (msg: ChatMessage) => void;
type SOSCallback = (data: SOSData) => void;
type LocationCallback = (data: LocationData) => void;
type PeerCallback = (peerId: string) => void;
type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'mesh-active') => void;

// Configuration from environment variables or defaults
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// PeerJS server configuration
const getPeerConfig = () => {
  const peerHost = import.meta.env.VITE_PEER_HOST || undefined;
  const peerPort = import.meta.env.VITE_PEER_PORT ? Number(import.meta.env.VITE_PEER_PORT) : undefined;
  const peerPath = import.meta.env.VITE_PEER_PATH || '/peerjs';
  const peerSecure = import.meta.env.VITE_PEER_SECURE === 'true';

  const config: any = {
    config: {
      iceServers: [
        // STUN servers for NAT traversal
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        // TURN server for relay if direct connection fails
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelay',
          credential: 'openrelay',
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelay',
          credential: 'openrelay',
        },
      ]
    }
  };

  // Only add host/port if explicitly configured
  if (peerHost) {
    config.host = peerHost;
    config.port = peerPort || 443;
    config.path = peerPath;
    config.secure = peerSecure;
  }

  return config;
};

class CommunicationService {
  private peer: Peer | null = null;
  private socket: Socket | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private myPeerId: string = '';
  private username: string = '';

  private messageCallbacks: MessageCallback[] = [];
  private sosCallbacks: SOSCallback[] = [];
  private locationCallbacks: LocationCallback[] = [];
  private peerConnectedCallbacks: PeerCallback[] = [];
  private peerDisconnectedCallbacks: PeerCallback[] = [];
  private statusCallbacks: StatusCallback[] = [];

  private messageHistory: ChatMessage[] = [];
  private knownPeers: Set<string> = new Set();
  private connectionAttempts: Map<string, number> = new Map();
  private maxRetries = 3;
  private connectionTimeout = 30000; // 30 seconds

  init(username: string): Promise<string> {
    this.username = username;
    console.log(`🚀 Initializing CommunicationService for user: ${username}`);
    console.log(`📍 Backend URL: ${BACKEND_URL}`);

    // Connect to signaling backend
    this.socket = io(BACKEND_URL);

    this.socket.on('connect', () => {
      console.log(`✅ Socket.IO connected: ${this.socket?.id}`);
      this.addSystemMessage(`✅ Connected to signaling server (${this.socket?.id})`);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Socket.IO disconnected');
      this.addSystemMessage('❌ Disconnected from signaling server');
    });

    return new Promise((resolve, reject) => {
      const peerConfig = getPeerConfig();
      console.log('🔧 Peer config:', peerConfig);
      this.peer = new Peer(undefined, peerConfig);

      this.peer.on('open', (id) => {
        console.log(`✅ Peer initialized with ID: ${id}`);
        this.myPeerId = id;
        this.notifyStatus('connected');
        this.addSystemMessage(`✅ Node initialized: ${id.slice(0, 8)}...`);

        // Auto-join location-based zone via socket
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            console.log(`📍 Got GPS location: ${pos.coords.latitude}, ${pos.coords.longitude}`);
            this.socket?.emit("join-network", {
              username: this.username,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              peerId: id,
            });
          },
          () => {
            console.log('📍 Using fallback location (Chennai)');
            // Fallback location (Chennai) if GPS denied
            this.socket?.emit("join-network", {
              username: this.username,
              lat: 13.0827,
              lng: 80.2707,
              peerId: id,
            });
          }
        );

        // Auto-connect to peers already in zone
        this.socket?.on("existing-users", (users: { username: string; peerId: string }[]) => {
          console.log(`🌐 Found ${users.length} existing user(s) in zone`);
          this.addSystemMessage(`Found ${users.length} node(s) in your zone`);
          users.forEach(user => {
            if (user.peerId && user.peerId !== id) {
              console.log(`  🔗 Auto-connecting to ${user.peerId.slice(0, 8)}...`);
              this.connectToPeer(user.peerId).catch(console.error);
            }
          });
        });

        // Auto-connect when a new peer joins zone
        this.socket?.on("user-joined", (user: { username: string; peerId: string }) => {
          if (user.peerId && user.peerId !== id) {
            this.addSystemMessage(`New node in zone: ${user.username}`);
            this.connectToPeer(user.peerId).catch(console.error);
          }
        });

        // Handle peer leaving zone
        this.socket?.on("user-left", ({ peerId }: { peerId: string }) => {
          if (this.connections.has(peerId)) {
            this.connections.get(peerId)?.close();
            this.connections.delete(peerId);
            this.addSystemMessage(`Node left zone: ${peerId.slice(0, 8)}...`);
          }
        });

        // Zone info confirmation
        this.socket?.on("zone-info", ({ room }: { room: string }) => {
          this.addSystemMessage(`📡 Joined zone: ${room}`);
        });

        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        this.addSystemMessage(`⚠ Network error: ${err.type}`);
        this.notifyStatus('disconnected');
      });

      this.peer.on('disconnected', () => {
        this.notifyStatus('disconnected');
        this.addSystemMessage('⚠ Disconnected from signaling server');
      });

      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });
  }

  private handleConnection(conn: DataConnection) {
    const peerId = conn.peer;
    console.log(`📍 handleConnection called for ${peerId.slice(0, 8)}...`);
    
    conn.on('open', () => {
      console.log(`✅ Data connection OPEN with ${peerId.slice(0, 8)}...`);
      this.connections.set(peerId, conn);
      this.knownPeers.add(peerId);
      this.peerConnectedCallbacks.forEach(cb => cb(peerId));
      this.addSystemMessage(`✅ Peer connected: ${peerId.slice(0, 8)}...`);
      this.notifyStatus('mesh-active');
    });

    conn.on('data', (data: unknown) => {
      const msg = data as { type: string; payload: any };
      console.log(`📨 Data received from ${peerId.slice(0, 8)}... Type: ${msg.type}`, msg.payload);
      switch (msg.type) {
        case 'chat':
          this.messageCallbacks.forEach(cb => cb(msg.payload));
          this.messageHistory.push(msg.payload);
          break;
        case 'sos':
          this.sosCallbacks.forEach(cb => cb(msg.payload));
          this.addSystemMessage(`🚨 SOS RECEIVED from ${msg.payload.sender}`);
          break;
        case 'location':
          this.locationCallbacks.forEach(cb => cb(msg.payload));
          break;
      }
    });

    conn.on('close', () => {
      console.log(`❌ Connection closed with ${peerId.slice(0, 8)}...`);
      this.connections.delete(peerId);
      this.peerDisconnectedCallbacks.forEach(cb => cb(peerId));
      this.addSystemMessage(`❌ Peer disconnected: ${peerId.slice(0, 8)}...`);
      if (this.connections.size === 0) {
        this.notifyStatus('connected');
      }
    });

    conn.on('error', (err) => {
      console.error(`⚠️ Connection error with ${peerId.slice(0, 8)}...`, err);
      this.addSystemMessage(`⚠️ Error from ${peerId.slice(0, 8)}...: ${err.message || err}`);
    });
  }

  connectToPeer(peerId: string, retryCount = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) return reject(new Error('Peer not initialized'));
      if (this.connections.has(peerId)) {
        console.log(`✓ Already connected to ${peerId.slice(0, 8)}...`);
        return resolve();
      }

      if (retryCount === 0) {
        this.connectionAttempts.set(peerId, 0);
      }

      console.log(`🔗 Connecting to peer ${peerId.slice(0, 8)}... (attempt ${retryCount + 1}/${this.maxRetries + 1})`);
      
      let timeoutHandle: NodeJS.Timeout | null = null;
      let resolved = false;

      try {
        const conn = this.peer.connect(peerId, { reliable: true });
        
        const onOpen = () => {
          if (!resolved) {
            resolved = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            conn.removeListener('error', onError);
            conn.removeListener('close', onClose);
            this.handleConnection(conn);
            console.log(`✅ Connected to peer ${peerId.slice(0, 8)}...`);
            resolve();
          }
        };

        const onError = (err: any) => {
          if (!resolved) {
            resolved = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            conn.removeListener('open', onOpen);
            conn.removeListener('close', onClose);
            console.error(`❌ Connection error for ${peerId.slice(0, 8)}...`, err.message || err);
            
            // Retry if we haven't exceeded max retries
            if (retryCount < this.maxRetries) {
              const delayMs = 1000 * Math.pow(2, retryCount); // exponential backoff
              console.log(`⏳ Retrying in ${delayMs}ms...`);
              setTimeout(() => {
                this.connectToPeer(peerId, retryCount + 1).then(resolve).catch(reject);
              }, delayMs);
            } else {
              reject(new Error(`Failed to connect after ${this.maxRetries + 1} attempts: ${err.message || err}`));
            }
          }
        };

        const onClose = () => {
          if (!resolved) {
            resolved = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            conn.removeListener('open', onOpen);
            conn.removeListener('error', onError);
            console.warn(`⚠️ Connection closed before opening for ${peerId.slice(0, 8)}...`);
            reject(new Error('Connection closed before opening'));
          }
        };

        // Timeout for connection attempt
        timeoutHandle = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            conn.removeListener('open', onOpen);
            conn.removeListener('error', onError);
            conn.removeListener('close', onClose);
            conn.close();
            console.warn(`⏱️ Connection timeout for ${peerId.slice(0, 8)}...`);
            
            // Retry if we haven't exceeded max retries
            if (retryCount < this.maxRetries) {
              const delayMs = 1000 * Math.pow(2, retryCount);
              console.log(`⏳ Retrying in ${delayMs}ms...`);
              setTimeout(() => {
                this.connectToPeer(peerId, retryCount + 1).then(resolve).catch(reject);
              }, delayMs);
            } else {
              reject(new Error(`Connection timeout after ${this.maxRetries + 1} attempts`));
            }
          }
        }, this.connectionTimeout);

        conn.once('open', onOpen);
        conn.once('error', onError);
        conn.once('close', onClose);
      } catch (err) {
        console.error(`❌ Exception connecting to ${peerId.slice(0, 8)}...`, err);
        reject(err);
      }
    });
  }

  private broadcast(type: string, payload: any) {
    const data = { type, payload };
    console.log(`📡 Broadcasting ${type} to ${this.connections.size} peer(s)`, payload);
    this.connections.forEach(conn => {
      if (conn.open) {
        console.log(`  → Sending to ${conn.peer.slice(0, 8)}...`);
        conn.send(data);
      } else {
        console.warn(`  ⚠️ Connection with ${conn.peer.slice(0, 8)}... not open, skipping`);
      }
    });
    if (this.connections.size === 0) {
      console.warn('⚠️ No peers to broadcast to');
    }
  }

  sendMessage(content: string) {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: this.username,
      content,
      timestamp: Date.now(),
      type: 'chat',
    };
    this.messageHistory.push(msg);
    this.messageCallbacks.forEach(cb => cb(msg));
    this.broadcast('chat', msg);
  }

  sendSOS(location?: { lat: number; lng: number }) {
    const data: SOSData = {
      sender: this.username,
      location,
      timestamp: Date.now(),
    };
    this.sosCallbacks.forEach(cb => cb(data));
    this.addSystemMessage(`🚨 SOS BROADCAST SENT`);
    this.broadcast('sos', data);
  }

  sendLocation(coords: { lat: number; lng: number }) {
    const data: LocationData = {
      ...coords,
      sender: this.username,
      timestamp: Date.now(),
    };
    this.locationCallbacks.forEach(cb => cb(data));
    this.broadcast('location', data);
  }

  private addSystemMessage(content: string) {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'SYSTEM',
      content,
      timestamp: Date.now(),
      type: 'system',
    };
    this.messageHistory.push(msg);
    this.messageCallbacks.forEach(cb => cb(msg));
  }

  private notifyStatus(status: 'connecting' | 'connected' | 'disconnected' | 'mesh-active') {
    this.statusCallbacks.forEach(cb => cb(status));
  }

  // Event subscriptions
  onMessage(cb: MessageCallback) { this.messageCallbacks.push(cb); return () => { this.messageCallbacks = this.messageCallbacks.filter(c => c !== cb); }; }
  onSOS(cb: SOSCallback) { this.sosCallbacks.push(cb); return () => { this.sosCallbacks = this.sosCallbacks.filter(c => c !== cb); }; }
  onLocation(cb: LocationCallback) { this.locationCallbacks.push(cb); return () => { this.locationCallbacks = this.locationCallbacks.filter(c => c !== cb); }; }
  onPeerConnected(cb: PeerCallback) { this.peerConnectedCallbacks.push(cb); return () => { this.peerConnectedCallbacks = this.peerConnectedCallbacks.filter(c => c !== cb); }; }
  onPeerDisconnected(cb: PeerCallback) { this.peerDisconnectedCallbacks.push(cb); return () => { this.peerDisconnectedCallbacks = this.peerDisconnectedCallbacks.filter(c => c !== cb); }; }
  onStatusChange(cb: StatusCallback) { this.statusCallbacks.push(cb); return () => { this.statusCallbacks = this.statusCallbacks.filter(c => c !== cb); }; }

  // Getters
  getPeerId() { return this.myPeerId; }
  getUsername() { return this.username; }
  getConnectedPeers() { return Array.from(this.connections.keys()); }
  getMessageHistory() { return [...this.messageHistory]; }

  destroy() {
    this.connections.forEach(c => c.close());
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const communicationService = new CommunicationService();