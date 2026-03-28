import { createLibp2p } from 'libp2p';
import { TCP } from '@libp2p/tcp';
import { MPLEX } from '@libp2p/mplex';
import { NOISE } from '@libp2p/noise';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { mdns } from '@libp2p/mdns';
import { PeerInfo } from '@libp2p/interface';

export interface MeshPeer {
  peerId: string;
  addresses: string[];
  protocols: string[];
  isConnected: boolean;
  lastSeen: number;
  username?: string;
}

export interface MeshMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  type: 'chat' | 'sos' | 'location' | 'system';
}

type PeerDiscoveredCallback = (peer: MeshPeer) => void;
type MessageCallback = (msg: MeshMessage) => void;
type StatusCallback = (status: string) => void;

/**
 * LibP2P Mesh Network Service with mDNS Discovery
 * Enables offline-first peer-to-peer communication with automatic LAN discovery
 */
class LibP2PMeshService {
  private node: any = null;
  private isInitialized = false;
  private discoveredPeers: Map<string, MeshPeer> = new Map();
  private messageHandlers: Map<string, MessageCallback> = new Map();
  private peerDiscoveryCallbacks: PeerDiscoveredCallback[] = [];
  private statusCallbacks: StatusCallback[] = [];
  private username: string = '';
  private peerId: string = '';

  /**
   * Initialize libp2p node with mDNS discovery
   */
  async init(username: string): Promise<string> {
    try {
      this.username = username;
      console.log(`🚀 [LibP2P Mesh] Initializing: ${username}`);

      this.node = await createLibp2p({
        addresses: {
          listen: ['/ip4/0.0.0.0/tcp/0']
        },
        transports: [new TCP()],
        streamMuxers: [new MPLEX()],
        connectionEncryption: [new NOISE()],
        services: {
          identify: identify(),
          ping: ping(),
          mdns: mdns({
            interval: 20e3, // Discover peers every 20 seconds
          }),
        },
        connectionManager: {
          maxConnections: 100,
          minConnections: 5,
        },
      });

      await this.node.start();
      this.peerId = this.node.peerId.toString();
      this.isInitialized = true;

      console.log(`✅ [LibP2P Mesh] Node started`);
      console.log(`📍 Peer ID: ${this.peerId}`);
      console.log(`🌐 Addresses: ${this.node.getMultiaddrs().map((m: any) => m.toString()).join(', ')}`);

      this.setupEventListeners();
      this.notifyStatus(`Ready (Mesh Mode)`);

      return this.peerId;
    } catch (error) {
      console.error('❌ [LibP2P Mesh] Initialization failed:', error);
      this.notifyStatus(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Setup mDNS discovery and peer event listeners
   */
  private setupEventListeners() {
    if (!this.node) return;

    // Listen for peer discovery via mDNS
    this.node.services.mdns.addEventListener('peer', (event: any) => {
      const { detail: { peerId, multiaddrs } } = event;
      this.handlePeerDiscovered(peerId.toString(), multiaddrs.map((m: any) => m.toString()));
    });

    // Listen for peer events
    this.node.addEventListener('peer:connect', ({ detail: peerId }: any) => {
      console.log(`🔗 [LibP2P Mesh] Connected to peer: ${peerId}`);
      const peer = this.discoveredPeers.get(peerId.toString());
      if (peer) {
        peer.isConnected = true;
        peer.lastSeen = Date.now();
        this.notifyPeerDiscovered(peer);
      }
    });

    this.node.addEventListener('peer:disconnect', ({ detail: peerId }: any) => {
      console.log(`🔌 [LibP2P Mesh] Disconnected from peer: ${peerId}`);
      const peer = this.discoveredPeers.get(peerId.toString());
      if (peer) {
        peer.isConnected = false;
      }
    });
  }

  /**
   * Handle newly discovered peer
   */
  private handlePeerDiscovered(peerId: string, addresses: string[]) {
    if (peerId === this.peerId) return; // Skip self

    let peer = this.discoveredPeers.get(peerId);
    if (!peer) {
      peer = {
        peerId,
        addresses,
        protocols: [],
        isConnected: false,
        lastSeen: Date.now(),
      };
      this.discoveredPeers.set(peerId, peer);
      console.log(`🆕 [LibP2P Mesh] Discovered peer: ${peerId.slice(0, 8)}... at ${addresses.join(', ')}`);
      this.notifyPeerDiscovered(peer);
    } else {
      peer.lastSeen = Date.now();
      peer.addresses = addresses;
    }
  }

  /**
   * Send message to specific peer
   */
  async sendMessage(targetPeerId: string, message: MeshMessage): Promise<void> {
    try {
      if (!this.node) throw new Error('Node not initialized');

      // In a real implementation, you'd use libp2p protocols
      // For now, this is a placeholder for custom protocol implementation
      console.log(`📤 [LibP2P Mesh] Sending message to ${targetPeerId.slice(0, 8)}...`);
      console.log(`   Content: ${message.content}`);

      // Store message locally for offline sync
      await this.storeMessageLocally(message);
    } catch (error) {
      console.error('❌ [LibP2P Mesh] Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Broadcast message to all discovered peers
   */
  async broadcastMessage(message: MeshMessage): Promise<void> {
    try {
      console.log(`📢 [LibP2P Mesh] Broadcasting message to ${this.discoveredPeers.size} peers`);
      
      for (const [peerId] of this.discoveredPeers) {
        await this.sendMessage(peerId, message);
      }

      // Store locally
      await this.storeMessageLocally(message);
    } catch (error) {
      console.error('❌ [LibP2P Mesh] Failed to broadcast:', error);
      throw error;
    }
  }

  /**
   * Get all discovered peers
   */
  getPeers(): MeshPeer[] {
    return Array.from(this.discoveredPeers.values());
  }

  /**
   * Get connected peers only
   */
  getConnectedPeers(): MeshPeer[] {
    return this.getPeers().filter(p => p.isConnected);
  }

  /**
   * Connect to a specific peer by ID
   */
  async connectToPeer(peerId: string): Promise<void> {
    try {
      const peer = this.discoveredPeers.get(peerId);
      if (!peer) throw new Error(`Peer ${peerId} not discovered`);

      console.log(`🔗 [LibP2P Mesh] Connecting to ${peerId.slice(0, 8)}...`);
      // Actual connection happens via libp2p protocols
      // mDNS discovery handles the multiaddrs
    } catch (error) {
      console.error('❌ [LibP2P Mesh] Connection failed:', error);
      throw error;
    }
  }

  /**
   * Store message locally for offline access
   */
  private async storeMessageLocally(message: MeshMessage): Promise<void> {
    try {
      const db = await this.getIndexedDB();
      const transaction = db.transaction('messages', 'readwrite');
      const store = transaction.objectStore('messages');
      await store.add(message);
    } catch (error) {
      console.warn('⚠️ [LibP2P Mesh] Failed to store message locally:', error);
      // Non-critical error
    }
  }

  /**
   * Get IndexedDB database
   */
  private getIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('StillAlive-Mesh', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('messages')) {
          db.createObjectStore('messages', { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Subscribe to peer discovered events
   */
  onPeerDiscovered(callback: PeerDiscoveredCallback): void {
    this.peerDiscoveryCallbacks.push(callback);
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: StatusCallback): void {
    this.statusCallbacks.push(callback);
  }

  /**
   * Notify peer discovery callbacks
   */
  private notifyPeerDiscovered(peer: MeshPeer) {
    this.peerDiscoveryCallbacks.forEach(cb => cb(peer));
  }

  /**
   * Notify status callbacks
   */
  private notifyStatus(status: string) {
    console.log(`📊 [LibP2P Mesh] Status: ${status}`);
    this.statusCallbacks.forEach(cb => cb(status));
  }

  /**
   * Shutdown the node
   */
  async shutdown(): Promise<void> {
    if (this.node) {
      await this.node.stop();
      this.isInitialized = false;
      console.log('🛑 [LibP2P Mesh] Node stopped');
    }
  }

  /**
   * Check if initialized
   */
  isRunning(): boolean {
    return this.isInitialized;
  }
}

// Singleton instance
let meshInstance: LibP2PMeshService | null = null;

export const getMeshService = (): LibP2PMeshService => {
  if (!meshInstance) {
    meshInstance = new LibP2PMeshService();
  }
  return meshInstance;
};

export default LibP2PMeshService;
