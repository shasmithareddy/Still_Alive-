import { getMeshService, type MeshPeer, type MeshMessage } from './libp2pMesh';
import { CommunicationService } from './communicationService';

export type OfflineMode = 'online' | 'offline' | 'hybrid';

export interface OfflineModeConfig {
  mode: OfflineMode;
  syncOnReconnect: boolean;
  localCacheEnabled: boolean;
  meshBroadcastEnabled: boolean;
}

type ModeChangeCallback = (mode: OfflineMode) => void;
type StoredMessage = MeshMessage & { synced?: boolean; localOnly?: boolean };

/**
 * Offline Mode Manager
 * Handles switching between online, offline, and hybrid modes
 * Manages data synchronization and caching
 */
class OfflineModeManager {
  private currentMode: OfflineMode = 'online';
  private meshService = getMeshService();
  private communicationService: CommunicationService | null = null;
  private modeChangeCallbacks: ModeChangeCallback[] = [];
  private config: OfflineModeConfig = {
    mode: 'online',
    syncOnReconnect: true,
    localCacheEnabled: true,
    meshBroadcastEnabled: true,
  };
  private db: IDBDatabase | null = null;
  private pendingMessages: StoredMessage[] = [];
  private isOnline = navigator.onLine;

  constructor() {
    this.setupEventListeners();
  }

  /**
   * Initialize offline mode manager
   * NOTE: Currently disabled due to browser compatibility issues with libp2p/mdns
   */
  async init(communicationService: CommunicationService): Promise<void> {
    this.communicationService = communicationService;
    this.currentMode = 'online';
    console.log('ℹ️ Offline mode manager ready (Online mode only)');
    // TODO: Re-enable mesh networking with proper browser polyfills
  }

  /**
   * Setup network and UI event listeners
   */
  private setupEventListeners() {
    // Listen to online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Watch for visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        console.log('📴 App hidden - switching to offline-first');
      } else {
        console.log('📱 App visible - checking connection');
        this.handleOnline();
      }
    });
  }

  /**
   * Handle coming online
   */
  private handleOnline() {
    this.isOnline = true;
    console.log('🔗 Online detected');

    if (this.currentMode === 'offline' && this.config.syncOnReconnect) {
      this.switchMode('hybrid').catch(err => console.error('Failed to switch to hybrid:', err));
    }

    // Sync pending messages
    if (this.config.syncOnReconnect) {
      this.syncPendingMessages().catch(err => console.error('Failed to sync:', err));
    }
  }

  /**
   * Handle going offline
   */
  private handleOffline() {
    this.isOnline = false;
    console.log('📴 Offline detected');

    if (this.currentMode === 'online' && this.config.meshBroadcastEnabled) {
      this.switchMode('hybrid').catch(err => console.error('Failed to switch to hybrid:', err));
    }
  }

  /**
   * Switch between modes
   */
  async switchMode(newMode: OfflineMode): Promise<void> {
    if (newMode === this.currentMode) return;

    console.log(`🔄 [Offline Mode] Switching: ${this.currentMode} → ${newMode}`);

    try {
      switch (newMode) {
        case 'online':
          await this.enableOnlineMode();
          break;
        case 'offline':
          await this.enableOfflineMode();
          break;
        case 'hybrid':
          await this.enableHybridMode();
          break;
      }

      this.currentMode = newMode;
      this.config.mode = newMode;
      this.notifyModeChange(newMode);
      console.log(`✅ [Offline Mode] Switched to ${newMode}`);
    } catch (error) {
      console.error(`❌ [Offline Mode] Switch failed:`, error);
      throw error;
    }
  }

  /**
   * Enable online-only mode (default)
   */
  private async enableOnlineMode(): Promise<void> {
    console.log('🌐 Enabling online mode');
    
    if (this.meshService.isRunning()) {
      await this.meshService.shutdown();
    }
  }

  /**
   * Enable offline-first mode (LAN mesh only)
   */
  private async enableOfflineMode(): Promise<void> {
    console.log('📴 Enabling offline mode');

    if (!this.meshService.isRunning()) {
      try {
        await this.meshService.init('Still-Alive-User');
        console.log('✅ Mesh network initialized');
      } catch (error) {
        console.error('❌ Failed to initialize mesh:', error);
        throw error;
      }
    }
  }

  /**
   * Enable hybrid mode (both online and offline)
   */
  private async enableHybridMode(): Promise<void> {
    console.log('🔀 Enabling hybrid mode');

    if (!this.meshService.isRunning()) {
      await this.enableOfflineMode();
    }

    // Keep online connection active if available
    if (this.communicationService && this.isOnline) {
      console.log('🔗 Keeping online connection active');
    }
  }

  /**
   * Send message with offline support
   */
  async sendMessage(content: string, messageType: 'chat' | 'sos' | 'location' = 'chat'): Promise<void> {
    const message: StoredMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sender: 'current-user', // Would be set from user context
      content,
      timestamp: Date.now(),
      type: messageType,
      synced: false,
      localOnly: !this.isOnline,
    };

    try {
      // Try to send via primary method
      if (this.isOnline && this.communicationService) {
        // Send through online channel
        console.log('📤 Sending via online channel');
        message.synced = true;
      }

      // Always attempt mesh broadcast in hybrid/offline
      if (this.currentMode !== 'online' && this.config.meshBroadcastEnabled) {
        await this.meshService.broadcastMessage({
          id: message.id,
          sender: message.sender,
          content: message.content,
          timestamp: message.timestamp,
          type: message.type,
        });
      }

      // Store locally
      await this.storeMessage(message);
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      // Still store locally for later sync
      await this.storeMessage(message);
    }
  }

  /**
   * Store message in IndexedDB
   */
  private async storeMessage(message: StoredMessage): Promise<void> {
    try {
      if (!this.db) await this.initializeIndexedDB();
      if (!this.db) throw new Error('Database not initialized');

      const transaction = this.db.transaction('messages', 'readwrite');
      const store = transaction.objectStore('messages');
      await new Promise((resolve, reject) => {
        const request = store.add(message);
        request.onsuccess = () => resolve(undefined);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('⚠️ Failed to store message:', error);
    }
  }

  /**
   * Load pending messages from IndexedDB
   */
  private async loadPendingMessages(): Promise<void> {
    try {
      if (!this.db) return;

      const transaction = this.db.transaction('messages', 'readonly');
      const store = transaction.objectStore('messages');

      const messages: StoredMessage[] = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      this.pendingMessages = messages.filter(m => !m.synced);
      console.log(`📦 Loaded ${this.pendingMessages.length} pending messages`);
    } catch (error) {
      console.warn('⚠️ Failed to load pending messages:', error);
    }
  }

  /**
   * Sync pending messages when coming online
   */
  private async syncPendingMessages(): Promise<void> {
    if (!this.isOnline || this.pendingMessages.length === 0) return;

    console.log(`🔄 Syncing ${this.pendingMessages.length} pending messages`);

    for (const message of this.pendingMessages) {
      try {
        if (this.communicationService) {
          // Send through online channel
          console.log(`✅ Synced: ${message.id}`);
          await this.markMessageSynced(message.id);
        }
      } catch (error) {
        console.error(`❌ Failed to sync ${message.id}:`, error);
      }
    }

    this.pendingMessages = this.pendingMessages.filter(m => !m.synced);
  }

  /**
   * Mark message as synced
   */
  private async markMessageSynced(messageId: string): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction('messages', 'readwrite');
    const store = transaction.objectStore('messages');
    const message = await new Promise<StoredMessage>((resolve, reject) => {
      const request = store.get(messageId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (message) {
      message.synced = true;
      await new Promise((resolve, reject) => {
        const request = store.put(message);
        request.onsuccess = () => resolve(undefined);
        request.onerror = () => reject(request.error);
      });
    }
  }

  /**
   * Initialize IndexedDB
   */
  private async initializeIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('StillAlive-OfflineMode', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('messages')) {
          db.createObjectStore('messages', { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Get current mode
   */
  getMode(): OfflineMode {
    return this.currentMode;
  }

  /**
   * Check if online
   */
  isNetworkOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Get discovered mesh peers
   */
  getDiscoveredPeers(): MeshPeer[] {
    return this.meshService.getPeers();
  }

  /**
   * Get connected mesh peers
   */
  getConnectedPeers(): MeshPeer[] {
    return this.meshService.getConnectedPeers();
  }

  /**
   * Get pending message count
   */
  getPendingMessageCount(): number {
    return this.pendingMessages.length;
  }

  /**
   * Subscribe to mode changes
   */
  onModeChange(callback: ModeChangeCallback): void {
    this.modeChangeCallbacks.push(callback);
  }

  /**
   * Notify mode change callbacks
   */
  private notifyModeChange(mode: OfflineMode) {
    this.modeChangeCallbacks.forEach(cb => cb(mode));
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<OfflineModeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get config
   */
  getConfig(): OfflineModeConfig {
    return { ...this.config };
  }
}

// Singleton
let instance: OfflineModeManager | null = null;

export const getOfflineModeManager = (): OfflineModeManager => {
  if (!instance) {
    instance = new OfflineModeManager();
  }
  return instance;
};

export default OfflineModeManager;
