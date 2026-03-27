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

// ✅ REPLACE THIS WITH YOUR MAC'S LOCAL IP
const BACKEND_URL = "http://172.16.40.134:3001";

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

  init(username: string): Promise<string> {
    this.username = username;

    // Connect to signaling backend
    this.socket = io(BACKEND_URL);

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    return new Promise((resolve, reject) => {
      this.peer = new Peer({
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ]
        }
      });

      this.peer.on('open', (id) => {
        this.myPeerId = id;
        this.notifyStatus('connected');
        this.addSystemMessage(`Node initialized: ${id.slice(0, 8)}...`);

        // Auto-join location-based zone via socket
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            this.socket?.emit("join-network", {
              username: this.username,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              peerId: id,
            });
          },
          () => {
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
          this.addSystemMessage(`Found ${users.length} node(s) in your zone`);
          users.forEach(user => {
            if (user.peerId && user.peerId !== id) {
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
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.knownPeers.add(conn.peer);
      this.peerConnectedCallbacks.forEach(cb => cb(conn.peer));
      this.addSystemMessage(`Peer connected: ${conn.peer.slice(0, 8)}...`);
      this.notifyStatus('mesh-active');
    });

    conn.on('data', (data: unknown) => {
      const msg = data as { type: string; payload: any };
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
      this.connections.delete(conn.peer);
      this.peerDisconnectedCallbacks.forEach(cb => cb(conn.peer));
      this.addSystemMessage(`Peer disconnected: ${conn.peer.slice(0, 8)}...`);
      if (this.connections.size === 0) {
        this.notifyStatus('connected');
      }
    });
  }

  connectToPeer(peerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) return reject(new Error('Not initialized'));
      if (this.connections.has(peerId)) return resolve();

      const conn = this.peer.connect(peerId, { reliable: true });
      this.handleConnection(conn);
      conn.on('open', () => resolve());
      conn.on('error', (err) => reject(err));
    });
  }

  private broadcast(type: string, payload: any) {
    const data = { type, payload };
    this.connections.forEach(conn => {
      if (conn.open) conn.send(data);
    });
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