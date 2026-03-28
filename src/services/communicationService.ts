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

// Represents any node in the zone — web (WebRTC) or CLI (socket-only)
export interface ZoneMember {
  username: string;
  peerId: string;
  isWebRTC: boolean;
}

type MessageCallback = (msg: ChatMessage) => void;
type SOSCallback = (data: SOSData) => void;
type LocationCallback = (data: LocationData) => void;
type PeerCallback = (peerId: string) => void;
type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'mesh-active') => void;
type ZoneMembersCallback = (members: ZoneMember[]) => void;

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const getPeerConfig = () => {
  const peerHost = import.meta.env.VITE_PEER_HOST || undefined;
  const peerPort = import.meta.env.VITE_PEER_PORT ? Number(import.meta.env.VITE_PEER_PORT) : undefined;
  const peerPath = import.meta.env.VITE_PEER_PATH || '/peerjs';
  const peerSecure = import.meta.env.VITE_PEER_SECURE === 'true';

  const config: Record<string, unknown> = {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelay', credential: 'openrelay' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelay', credential: 'openrelay' },
      ]
    }
  };

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

  // WebRTC connections (web peers only)
  private connections: Map<string, DataConnection> = new Map();

  // ALL zone members — web + CLI — keyed by peerId
  private zoneMembers: Map<string, ZoneMember> = new Map();

  private myPeerId: string = '';
  private username: string = '';
  private currentRoom: string = '';

  // Latest known status — so late subscribers get it immediately
  private currentStatus: 'connecting' | 'connected' | 'disconnected' | 'mesh-active' = 'connecting';

  private messageCallbacks: MessageCallback[] = [];
  private sosCallbacks: SOSCallback[] = [];
  private locationCallbacks: LocationCallback[] = [];
  private peerConnectedCallbacks: PeerCallback[] = [];
  private peerDisconnectedCallbacks: PeerCallback[] = [];
  private statusCallbacks: StatusCallback[] = [];
  private zoneMembersCallbacks: ZoneMembersCallback[] = [];

  private messageHistory: ChatMessage[] = [];
  private knownPeers: Set<string> = new Set();
  private maxRetries = 3;
  private connectionTimeout = 30000;
  private seenMessageIds: Set<string> = new Set();

  private dedupeKey(sender: string, content: string, timestamp: number | string): string {
    const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
    return `${sender}::${content}::${Math.floor(ts / 2000)}`;
  }

  private notifyZoneMembers() {
    const members = Array.from(this.zoneMembers.values());
    this.zoneMembersCallbacks.forEach(cb => cb(members));
  }

  init(username: string): Promise<string> {
    this.username = username;
    this.currentStatus = 'connecting';

    this.socket = io(BACKEND_URL, { reconnectionDelay: 1000, reconnectionAttempts: 10 });

    this.socket.on('connect', () => {
      this.addSystemMessage(`✅ Connected to signaling server`);
      this.notifyStatus('connected');
    });

    this.socket.on('disconnect', () => {
      this.addSystemMessage('❌ Disconnected from signaling server');
      this.notifyStatus('disconnected');
    });

    // ✅ Authoritative zone member list from server (includes CLI peers)
    this.socket.on('zone-members', (members: ZoneMember[]) => {
      // Rebuild zoneMembers from server truth, preserving self
      const self = this.zoneMembers.get(this.myPeerId);
      this.zoneMembers.clear();
      if (self) this.zoneMembers.set(this.myPeerId, self);

      members.forEach(m => {
        if (m.peerId === this.myPeerId) return;
        // Preserve isWebRTC=true if we already have a live WebRTC conn
        const hasConn = this.connections.has(m.peerId);
        this.zoneMembers.set(m.peerId, {
          ...m,
          isWebRTC: hasConn ? true : m.isWebRTC,
        });
      });

      this.notifyZoneMembers();

      const othersCount = this.zoneMembers.size - 1; // minus self
      if (othersCount > 0) {
        this.notifyStatus(this.connections.size > 0 ? 'mesh-active' : 'connected');
      }
    });

    // ✅ CLI peer joined zone — add immediately to UI
    this.socket.on('cli-peer-joined', (user: { username: string; peerId: string }) => {
      if (user.peerId === this.myPeerId) return;
      this.zoneMembers.set(user.peerId, { username: user.username, peerId: user.peerId, isWebRTC: false });
      this.notifyZoneMembers();
      this.addSystemMessage(`📡 CLI node joined: ${user.username}`);
      this.peerConnectedCallbacks.forEach(cb => cb(user.peerId));
      this.notifyStatus(this.connections.size > 0 ? 'mesh-active' : 'connected');
    });

    // ✅ CLI peer left zone
    this.socket.on('cli-peer-left', ({ peerId }: { peerId: string }) => {
      const member = this.zoneMembers.get(peerId);
      if (member) {
        this.addSystemMessage(`👋 CLI node left: ${member.username}`);
        this.zoneMembers.delete(peerId);
        this.notifyZoneMembers();
      }
      this.peerDisconnectedCallbacks.forEach(cb => cb(peerId));
      if (this.connections.size === 0 && this.zoneMembers.size <= 1) {
        this.notifyStatus('connected');
      }
    });

    // ✅ Chat from server — CLI messages + web relay
    this.socket.on('chat', (data: { username: string; msg: string; timestamp: string }) => {
      if (data.username === this.username) return;

      const key = this.dedupeKey(data.username, data.msg, data.timestamp);
      if (this.seenMessageIds.has(key)) return;
      this.seenMessageIds.add(key);

      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        sender: data.username,
        content: data.msg,
        timestamp: new Date(data.timestamp).getTime(),
        type: 'chat',
      };
      this.messageHistory.push(msg);
      this.messageCallbacks.forEach(cb => cb(msg));
    });

    // ✅ Chat history on join
    this.socket.on('chat-history', (history: Array<{ username: string; msg: string; timestamp: string }>) => {
      history.forEach(h => {
        const key = this.dedupeKey(h.username, h.msg, h.timestamp);
        if (this.seenMessageIds.has(key)) return;
        this.seenMessageIds.add(key);

        const msg: ChatMessage = {
          id: crypto.randomUUID(),
          sender: h.username,
          content: h.msg,
          timestamp: new Date(h.timestamp).getTime(),
          type: 'chat',
        };
        this.messageHistory.push(msg);
        this.messageCallbacks.forEach(cb => cb(msg));
      });
    });

    // SOS from server
    this.socket.on('sos', (data: { username: string; msg: string; lat?: number; lng?: number }) => {
      const sosData: SOSData = {
        sender: data.username,
        location: data.lat && data.lng ? { lat: data.lat, lng: data.lng } : undefined,
        timestamp: Date.now(),
      };
      this.sosCallbacks.forEach(cb => cb(sosData));
      this.addSystemMessage(`🚨 SOS from ${data.username}: ${data.msg}`);
    });

    return new Promise((resolve, reject) => {
      this.peer = new Peer(undefined, getPeerConfig());

      this.peer.on('open', (id) => {
        this.myPeerId = id;
        this.addSystemMessage(`✅ Node initialized: ${id.slice(0, 8)}...`);

        // Add self to zone members
        this.zoneMembers.set(id, { username: this.username, peerId: id, isWebRTC: true });
        this.notifyZoneMembers();

        const joinWithLocation = (lat: number, lng: number) => {
          this.socket?.emit('join-network', { username: this.username, lat, lng, peerId: id });
        };

        navigator.geolocation.getCurrentPosition(
          (pos) => joinWithLocation(pos.coords.latitude, pos.coords.longitude),
          () => {
            console.log('📍 GPS unavailable, using Chennai fallback');
            joinWithLocation(13.0827, 80.2707);
          }
        );

        this.socket?.on('zone-info', ({ room }: { room: string }) => {
          this.currentRoom = room;
          this.addSystemMessage(`📡 Joined zone: ${room}`);
          // Re-emit status now that we have a room
          this.notifyStatus(this.zoneMembers.size > 1 ? 'connected' : 'connected');
        });

        // ✅ Existing web users — attempt WebRTC
        this.socket?.on('existing-users', (users: { username: string; peerId: string }[]) => {
          if (users.length > 0) {
            this.addSystemMessage(`Found ${users.length} web node(s) in your zone`);
          }
          users.forEach(user => {
            if (user.peerId === id) return;
            // Add with isWebRTC=false until WebRTC connects
            if (!this.zoneMembers.has(user.peerId)) {
              this.zoneMembers.set(user.peerId, { username: user.username, peerId: user.peerId, isWebRTC: false });
            }
            this.connectToPeer(user.peerId).catch(() => {
              console.log(`ℹ️ ${user.username} is a CLI/socket-only peer`);
            });
          });
          this.notifyZoneMembers();
        });

        // ✅ New web user joined zone
        this.socket?.on('user-joined', (user: { username: string; peerId: string }) => {
          if (user.peerId === id) return;
          this.addSystemMessage(`📡 ${user.username} joined the zone`);
          if (!this.zoneMembers.has(user.peerId)) {
            this.zoneMembers.set(user.peerId, { username: user.username, peerId: user.peerId, isWebRTC: false });
          }
          this.notifyZoneMembers();
          this.peerConnectedCallbacks.forEach(cb => cb(user.peerId));
          this.connectToPeer(user.peerId).catch(() => {
            console.log(`ℹ️ ${user.username} could not establish WebRTC`);
          });
          this.notifyStatus(this.connections.size > 0 ? 'mesh-active' : 'connected');
        });

        // ✅ User left zone
        this.socket?.on('user-left', ({ peerId }: { peerId: string }) => {
          const member = this.zoneMembers.get(peerId);
          if (member) {
            this.addSystemMessage(`👋 ${member.username} left the zone`);
            this.zoneMembers.delete(peerId);
            this.notifyZoneMembers();
          }
          if (this.connections.has(peerId)) {
            this.connections.get(peerId)?.close();
            this.connections.delete(peerId);
          }
          this.peerDisconnectedCallbacks.forEach(cb => cb(peerId));
          if (this.connections.size === 0 && this.zoneMembers.size <= 1) {
            this.notifyStatus('connected');
          }
        });

        resolve(id);
      });

      this.peer.on('connection', (conn) => this.handleConnection(conn));

      this.peer.on('error', (err) => {
        this.addSystemMessage(`⚠ Network error: ${err.type}`);
        if (err.type === 'unavailable-id' || err.type === 'server-error') {
          this.notifyStatus('disconnected');
        }
      });

      this.peer.on('disconnected', () => {
        this.notifyStatus('disconnected');
        this.addSystemMessage('⚠ Disconnected from peer network');
      });

      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });
  }

  private handleConnection(conn: DataConnection) {
    const peerId = conn.peer;

    conn.on('open', () => {
      this.connections.set(peerId, conn);
      this.knownPeers.add(peerId);

      // Mark as WebRTC peer in zone members
      const existing = this.zoneMembers.get(peerId);
      if (existing) {
        this.zoneMembers.set(peerId, { ...existing, isWebRTC: true });
      }
      this.notifyZoneMembers();

      this.peerConnectedCallbacks.forEach(cb => cb(peerId));
      this.addSystemMessage(`✅ WebRTC connected: ${peerId.slice(0, 8)}...`);
      this.notifyStatus('mesh-active');
    });

    conn.on('data', (data: unknown) => {
      const msg = data as { type: string; payload: unknown };
      switch (msg.type) {
        case 'chat': {
          const p = msg.payload as ChatMessage;
          const key = this.dedupeKey(p.sender, p.content, p.timestamp);
          if (this.seenMessageIds.has(key)) return;
          this.seenMessageIds.add(key);
          this.messageCallbacks.forEach(cb => cb(p));
          this.messageHistory.push(p);
          break;
        }
        case 'sos':
          this.sosCallbacks.forEach(cb => cb(msg.payload as SOSData));
          this.addSystemMessage(`🚨 SOS RECEIVED from ${(msg.payload as SOSData).sender}`);
          break;
        case 'location':
          this.locationCallbacks.forEach(cb => cb(msg.payload as LocationData));
          break;
      }
    });

    conn.on('close', () => {
      this.connections.delete(peerId);
      // Downgrade to socket-only, don't remove from zone
      const existing = this.zoneMembers.get(peerId);
      if (existing) {
        this.zoneMembers.set(peerId, { ...existing, isWebRTC: false });
        this.notifyZoneMembers();
      }
      this.peerDisconnectedCallbacks.forEach(cb => cb(peerId));
      this.addSystemMessage(`⚠ WebRTC dropped: ${peerId.slice(0, 8)}... (still in zone)`);
      if (this.connections.size === 0) this.notifyStatus('connected');
    });

    conn.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.addSystemMessage(`⚠️ Error from ${peerId.slice(0, 8)}...: ${msg}`);
    });
  }

  connectToPeer(peerId: string, retryCount = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) return reject(new Error('Peer not initialized'));
      if (this.connections.has(peerId)) return resolve();

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      let resolved = false;

      try {
        const conn = this.peer.connect(peerId, { reliable: true });

        const done = (fn: () => void) => {
          if (!resolved) {
            resolved = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            conn.removeAllListeners();
            fn();
          }
        };

        const retry = (err: unknown) => {
          if (retryCount < this.maxRetries) {
            setTimeout(() => {
              this.connectToPeer(peerId, retryCount + 1).then(resolve).catch(reject);
            }, 1000 * Math.pow(2, retryCount));
          } else {
            const errMsg = err instanceof Error ? err.message : String(err);
            reject(new Error(`Failed after ${this.maxRetries + 1} attempts: ${errMsg}`));
          }
        };

        conn.once('open', () => done(() => { this.handleConnection(conn); resolve(); }));
        conn.once('error', (err) => done(() => retry(err)));
        conn.once('close', () => done(() => reject(new Error('Closed before open'))));

        timeoutHandle = setTimeout(() => {
          done(() => { conn.close(); retry(new Error('timeout')); });
        }, this.connectionTimeout);

      } catch (err) {
        reject(err);
      }
    });
    }

    private broadcast(type: string, payload: unknown) {
    this.connections.forEach(conn => {
      if (conn.open) conn.send({ type, payload });
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

    const key = this.dedupeKey(msg.sender, msg.content, msg.timestamp);
    this.seenMessageIds.add(key);

    this.messageHistory.push(msg);
    this.messageCallbacks.forEach(cb => cb(msg));

    // WebRTC → web peers
    this.broadcast('chat', msg);

    // Socket → server → CLI + other web clients
    if (this.socket && this.currentRoom) {
      this.socket.emit('chat', {
        username: this.username,
        msg: content,
        room: this.currentRoom,
      });
    }
  }

  sendSOS(location?: { lat: number; lng: number }) {
    const data: SOSData = { sender: this.username, location, timestamp: Date.now() };
    this.sosCallbacks.forEach(cb => cb(data));
    this.addSystemMessage(`🚨 SOS BROADCAST SENT`);
    this.broadcast('sos', data);

    if (this.socket) {
      this.socket.emit('sos', {
        username: this.username,
        lat: location?.lat,
        lng: location?.lng,
        msg: 'SOS EMERGENCY',
        room: this.currentRoom,
      });
    }
  }

  sendLocation(coords: { lat: number; lng: number }) {
    const data: LocationData = { ...coords, sender: this.username, timestamp: Date.now() };
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
    this.currentStatus = status;
    this.statusCallbacks.forEach(cb => cb(status));
  }

  // Subscriptions — immediately emit current state to new subscribers
  onMessage(cb: MessageCallback) {
    this.messageCallbacks.push(cb);
    return () => { this.messageCallbacks = this.messageCallbacks.filter(c => c !== cb); };
  }
  onSOS(cb: SOSCallback) {
    this.sosCallbacks.push(cb);
    return () => { this.sosCallbacks = this.sosCallbacks.filter(c => c !== cb); };
  }
  onLocation(cb: LocationCallback) {
    this.locationCallbacks.push(cb);
    return () => { this.locationCallbacks = this.locationCallbacks.filter(c => c !== cb); };
  }
  onPeerConnected(cb: PeerCallback) {
    this.peerConnectedCallbacks.push(cb);
    return () => { this.peerConnectedCallbacks = this.peerConnectedCallbacks.filter(c => c !== cb); };
  }
  onPeerDisconnected(cb: PeerCallback) {
    this.peerDisconnectedCallbacks.push(cb);
    return () => { this.peerDisconnectedCallbacks = this.peerDisconnectedCallbacks.filter(c => c !== cb); };
  }
  onStatusChange(cb: StatusCallback) {
    this.statusCallbacks.push(cb);
    // ✅ Immediately fire current status so late subscribers don't get stuck on 'connecting'
    cb(this.currentStatus);
    return () => { this.statusCallbacks = this.statusCallbacks.filter(c => c !== cb); };
  }
  onZoneMembers(cb: ZoneMembersCallback) {
    this.zoneMembersCallbacks.push(cb);
    // ✅ Immediately emit current members to new subscriber
    cb(Array.from(this.zoneMembers.values()));
    return () => { this.zoneMembersCallbacks = this.zoneMembersCallbacks.filter(c => c !== cb); };
  }

  // Getters
  getPeerId() { return this.myPeerId; }
  getUsername() { return this.username; }
  getCurrentRoom() { return this.currentRoom; }
  getConnectedPeers() { return Array.from(this.connections.keys()); }
  getZoneMembers() { return Array.from(this.zoneMembers.values()); }
  getMessageHistory() { return [...this.messageHistory]; }
  getTotalPeerCount() {
    return Array.from(this.zoneMembers.values()).filter(m => m.peerId !== this.myPeerId).length;
  }

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