import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { communicationService, ZoneMember } from '@/services/communicationService';

const NetworkStatus = () => {
  // ✅ Initialize from service immediately — no waiting for events
  const [status, setStatus] = useState<string>(() => 'connecting');
  const [zoneMembers, setZoneMembers] = useState<ZoneMember[]>([]);
  const [peerId, setPeerId] = useState('');
  const [room, setRoom] = useState('');

  useEffect(() => {
    // Sync static values immediately
    setPeerId(communicationService.getPeerId());
    setRoom(communicationService.getCurrentRoom());

    // Poll for peerId and room since they're set async after init
    const poll = setInterval(() => {
      const id = communicationService.getPeerId();
      const r = communicationService.getCurrentRoom();
      if (id) setPeerId(id);
      if (r) setRoom(r);
    }, 500);

    const unsubs = [
      // ✅ onStatusChange now fires immediately with current status
      communicationService.onStatusChange(setStatus),

      // ✅ onZoneMembers now fires immediately with current members (includes CLI peers)
      communicationService.onZoneMembers((members) => {
        const others = members.filter(m => m.peerId !== communicationService.getPeerId());
        setZoneMembers(others);
      }),

      // WebRTC events — refresh zone members
      communicationService.onPeerConnected(() => {
        const others = communicationService.getZoneMembers().filter(
          m => m.peerId !== communicationService.getPeerId()
        );
        setZoneMembers(others);
      }),
      communicationService.onPeerDisconnected(() => {
        const others = communicationService.getZoneMembers().filter(
          m => m.peerId !== communicationService.getPeerId()
        );
        setZoneMembers(others);
      }),
    ];

    return () => {
      clearInterval(poll);
      unsubs.forEach(u => u());
    };
  }, []);

  const statusColor = {
    connecting: 'text-muted-foreground',
    connected: 'text-foreground',
    disconnected: 'text-destructive',
    'mesh-active': 'text-foreground glow-text',
  }[status] || 'text-muted-foreground';

  const statusDot = {
    connecting: 'bg-muted-foreground',
    connected: 'bg-primary/60',
    disconnected: 'bg-destructive',
    'mesh-active': 'bg-primary',
  }[status] || 'bg-muted-foreground';

  const copyPeerId = () => {
    if (peerId) navigator.clipboard.writeText(peerId);
  };

  return (
    <div className="border border-border bg-card rounded-sm p-3 space-y-3" style={{ boxShadow: 'var(--terminal-glow)' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground glow-text">MESH://STATUS</span>
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className={`w-2 h-2 rounded-full ${statusDot}`}
        />
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">STATUS:</span>
          <span className={statusColor}>{status.toUpperCase()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">PEERS:</span>
          {/* ✅ Shows ALL peers in zone — web + CLI */}
          <span className="text-foreground">{zoneMembers.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">ZONE:</span>
          <span className="text-foreground text-right truncate max-w-[120px]" title={room}>
            {room || '—'}
          </span>
        </div>
        <div className="flex justify-between items-start gap-2">
          <span className="text-muted-foreground shrink-0">NODE ID:</span>
          <button
            onClick={copyPeerId}
            className="text-foreground text-right break-all hover:text-primary transition-colors"
            title="Click to copy"
          >
            {peerId ? `${peerId.slice(0, 16)}...` : '—'}
          </button>
        </div>
      </div>

      {/* ✅ Shows all zone members with their type (WebRTC or CLI) */}
      {zoneMembers.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">ZONE NODES ({zoneMembers.length}):</span>
          {zoneMembers.map(m => (
            <div key={m.peerId} className="text-xs text-secondary-foreground flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <span className={m.isWebRTC ? 'text-primary' : 'text-yellow-500'}>●</span>
                <span>{m.username}</span>
              </div>
              <span className="text-muted-foreground text-[10px]">
                {m.isWebRTC ? 'WebRTC' : 'CLI'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NetworkStatus;
