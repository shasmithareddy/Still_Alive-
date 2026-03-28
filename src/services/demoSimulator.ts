import { communicationService, ChatMessage } from './communicationService';

const FAKE_CALLSIGNS = ['BRAVO-7', 'DELTA-3', 'ECHO-9', 'FOXTROT-1', 'GHOST-4', 'HAWK-2', 'IRON-6', 'JACKAL-8'];
const FAKE_MESSAGES = [
  'Area clear, moving to sector 4',
  'Copy that, holding position',
  'Need medical supplies at checkpoint',
  'Water source found at grid ref 4827',
  'All units, regroup at rally point',
  'Signal strength improving',
  'Relay node established successfully',
  'Confirming 3 survivors located',
  'Road blocked, rerouting via north ridge',
  'Battery at 40%, switching to low power mode',
  'Shelter secured, capacity for 20',
  'Weather update: storm clearing in 2hrs',
];

const FAKE_PEER_IDS = [
  'mesh-a7f3b2c1-demo', 'mesh-d4e8f9a0-demo', 'mesh-b1c5d6e2-demo',
  'mesh-f0a3b7c8-demo', 'mesh-e9d2c4a1-demo', 'mesh-c6b0a5d3-demo',
];

interface SimNode {
  id: string;
  name: string;
  x: number;
  y: number;
  connections: string[];
  isSOSActive?: boolean;
}

export interface SimulationState {
  active: boolean;
  nodes: SimNode[];
  packets: { from: string; to: string; progress: number }[];
}

type SimCallback = (state: SimulationState) => void;

class DemoSimulator {
  private active = false;
  private intervalIds: ReturnType<typeof setInterval>[] = [];
  private nodes: SimNode[] = [];
  private callbacks: SimCallback[] = [];
  private packets: { from: string; to: string; progress: number }[] = [];

  start() {
    if (this.active) return;
    this.active = true;

    // Create fake topology
    this.nodes = FAKE_PEER_IDS.slice(0, 5).map((id, i) => ({
      id,
      name: FAKE_CALLSIGNS[i],
      x: 0.2 + Math.random() * 0.6,
      y: 0.2 + Math.random() * 0.6,
      connections: [],
    }));

    // Add self node at center
    const selfNode: SimNode = {
      id: 'self',
      name: communicationService.getUsername() || 'YOU',
      x: 0.5,
      y: 0.5,
      connections: [this.nodes[0].id, this.nodes[1].id],
    };
    this.nodes.unshift(selfNode);

    // Create mesh connections
    for (let i = 1; i < this.nodes.length; i++) {
      const connectTo = i === 1 ? 0 : Math.floor(Math.random() * i);
      this.nodes[i].connections.push(this.nodes[connectTo].id);
      this.nodes[connectTo].connections.push(this.nodes[i].id);

      // Add some extra connections for mesh density
      if (Math.random() > 0.5 && i > 2) {
        const extra = Math.floor(Math.random() * (i - 1)) + 1;
        if (!this.nodes[i].connections.includes(this.nodes[extra].id)) {
          this.nodes[i].connections.push(this.nodes[extra].id);
          this.nodes[extra].connections.push(this.nodes[i].id);
        }
      }
    }

    this.notifyCallbacks();

    // System announcement
    communicationService.sendMessage('[ DEMO MODE ACTIVATED ]');

    // Simulate peer connections appearing
    let peerIndex = 0;
    const connectInterval = setInterval(() => {
      if (peerIndex < 3 && this.active) {
        const name = FAKE_CALLSIGNS[peerIndex];
        this.injectSystemMessage(`Peer connected: ${name} (relay node)`);
        peerIndex++;
      }
    }, 2000);
    this.intervalIds.push(connectInterval);

    // Simulate chat messages
    const chatInterval = setInterval(() => {
      if (!this.active) return;
      const sender = FAKE_CALLSIGNS[Math.floor(Math.random() * 4)];
      const msg = FAKE_MESSAGES[Math.floor(Math.random() * FAKE_MESSAGES.length)];
      this.injectChatMessage(sender, msg);

      // Animate a packet
      if (this.nodes.length > 2) {
        const fromIdx = Math.floor(Math.random() * this.nodes.length);
        let toIdx = Math.floor(Math.random() * this.nodes.length);
        if (toIdx === fromIdx) toIdx = (toIdx + 1) % this.nodes.length;
        this.animatePacket(this.nodes[fromIdx].id, this.nodes[toIdx].id);
      }
    }, 3500);
    this.intervalIds.push(chatInterval);

    // Simulate SOS after 8 seconds
    setTimeout(() => {
      if (!this.active) return;
      const sosNode = this.nodes[3];
      if (sosNode) {
        sosNode.isSOSActive = true;
        this.injectSystemMessage(`🚨 SOS RECEIVED from ${sosNode.name} — Location: 28.61°N, 77.21°E`);
        this.notifyCallbacks();
        setTimeout(() => {
          if (sosNode) sosNode.isSOSActive = false;
          this.notifyCallbacks();
        }, 5000);
      }
    }, 8000);

    // Simulate node movement (slight drift)
    const driftInterval = setInterval(() => {
      if (!this.active) return;
      this.nodes.forEach((n, i) => {
        if (i === 0) return; // Keep self centered
        n.x = Math.max(0.1, Math.min(0.9, n.x + (Math.random() - 0.5) * 0.02));
        n.y = Math.max(0.1, Math.min(0.9, n.y + (Math.random() - 0.5) * 0.02));
      });
      this.notifyCallbacks();
    }, 1000);
    this.intervalIds.push(driftInterval);

    // Packet animation ticker
    const packetInterval = setInterval(() => {
      if (!this.active) return;
      this.packets = this.packets
        .map(p => ({ ...p, progress: p.progress + 0.05 }))
        .filter(p => p.progress <= 1);
      this.notifyCallbacks();
    }, 50);
    this.intervalIds.push(packetInterval);
  }

  stop() {
    this.active = false;
    this.intervalIds.forEach(clearInterval);
    this.intervalIds = [];
    this.nodes = [];
    this.packets = [];
    this.injectSystemMessage('[ DEMO MODE DEACTIVATED ]');
    this.notifyCallbacks();
  }

  isActive() { return this.active; }

  getState(): SimulationState {
    return { active: this.active, nodes: [...this.nodes], packets: [...this.packets] };
  }

  onUpdate(cb: SimCallback) {
    this.callbacks.push(cb);
    return () => { this.callbacks = this.callbacks.filter(c => c !== cb); };
  }

  private notifyCallbacks() {
    const state = this.getState();
    this.callbacks.forEach(cb => cb(state));
  }

  private animatePacket(from: string, to: string) {
    this.packets.push({ from, to, progress: 0 });
  }

  private injectSystemMessage(content: string) {
    // Use the public sendMessage to inject into chat history visible to UI
    // We'll use a workaround: directly push via the service's message callbacks
    const msg = {
      id: crypto.randomUUID(),
      sender: 'SYSTEM',
      content,
      timestamp: Date.now(),
      type: 'system' as const,
    };
    // Access internal callbacks through the service
    const svc = communicationService as unknown as { messageHistory: ChatMessage[]; messageCallbacks: Array<(m: ChatMessage) => void> };
    svc.messageHistory.push(msg);
    svc.messageCallbacks.forEach(cb => cb(msg));
  }

  private injectChatMessage(sender: string, content: string) {
    const msg = {
      id: crypto.randomUUID(),
      sender,
      content,
      timestamp: Date.now(),
      type: 'chat' as const,
    };
    const svc = communicationService as unknown as { messageHistory: ChatMessage[]; messageCallbacks: Array<(m: ChatMessage) => void> };
    svc.messageHistory.push(msg);
    svc.messageCallbacks.forEach(cb => cb(msg));
  }
}

export const demoSimulator = new DemoSimulator();
