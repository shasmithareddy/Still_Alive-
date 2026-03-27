import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { communicationService } from '@/services/communicationService';

const NetworkStatus = () => {
  const [status, setStatus] = useState<string>('connecting');
  const [peers, setPeers] = useState<string[]>([]);
  const [peerId, setPeerId] = useState('');

  useEffect(() => {
    setPeerId(communicationService.getPeerId());

    const unsubs = [
      communicationService.onStatusChange(setStatus),
      communicationService.onPeerConnected(() => setPeers(communicationService.getConnectedPeers())),
      communicationService.onPeerDisconnected(() => setPeers(communicationService.getConnectedPeers())),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  const statusColor = {
    connecting: 'text-muted-foreground',
    connected: 'text-foreground',
    disconnected: 'text-destructive',
    'mesh-active': 'text-foreground glow-text',
  }[status] || 'text-muted-foreground';

  const copyPeerId = () => {
    navigator.clipboard.writeText(peerId);
  };

  return (
    <div className="border border-border bg-card rounded-sm p-3 space-y-3" style={{ boxShadow: 'var(--terminal-glow)' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground glow-text">MESH://STATUS</span>
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className={`w-2 h-2 rounded-full ${status === 'mesh-active' ? 'bg-primary' : status === 'connected' ? 'bg-primary/60' : 'bg-destructive'}`}
        />
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">STATUS:</span>
          <span className={statusColor}>{status.toUpperCase()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">PEERS:</span>
          <span className="text-foreground">{peers.length}</span>
        </div>
        <div className="flex justify-between items-start gap-2">
          <span className="text-muted-foreground shrink-0">NODE ID:</span>
          <button
            onClick={copyPeerId}
            className="text-foreground text-right break-all hover:text-primary transition-colors"
            title="Click to copy"
          >
            {peerId.slice(0, 16)}...
          </button>
        </div>
      </div>

      {peers.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">CONNECTED NODES:</span>
          {peers.map(p => (
            <div key={p} className="text-xs text-secondary-foreground flex items-center gap-1">
              <span className="text-foreground">●</span> {p.slice(0, 12)}...
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NetworkStatus;
