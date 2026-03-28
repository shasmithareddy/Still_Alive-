import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { communicationService, ZoneMember } from '@/services/communicationService';

interface TopoNode {
  id: string;
  name: string;
  x: number;
  y: number;
  isWebRTC: boolean;
  isSelf: boolean;
}

const MeshTopology = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef(0);
  const [nodes, setNodes] = useState<TopoNode[]>([]);
  const [isActive, setIsActive] = useState(false);

  // Convert zone members → canvas nodes arranged in a circle
  const buildNodes = useCallback((members: ZoneMember[]) => {
    const selfId = communicationService.getPeerId();
    const selfName = communicationService.getUsername();

    const all = [
      { peerId: selfId, username: selfName, isWebRTC: true, isSelf: true },
      ...members
        .filter(m => m.peerId !== selfId)
        .map(m => ({ ...m, isSelf: false })),
    ];

    const total = all.length;
    return all.map((m, i) => {
      // Self always at center; others orbit around
      if (m.isSelf) {
        return { id: m.peerId, name: m.username, x: 0.5, y: 0.5, isWebRTC: true, isSelf: true };
      }
      const angle = ((i - 1) / Math.max(total - 1, 1)) * Math.PI * 2 - Math.PI / 2;
      const radius = total <= 3 ? 0.3 : 0.35;
      return {
        id: m.peerId,
        name: m.username,
        x: 0.5 + Math.cos(angle) * radius,
        y: 0.5 + Math.sin(angle) * radius,
        isWebRTC: m.isWebRTC,
        isSelf: false,
      };
    });
  }, []);

  useEffect(() => {
    // Initialize with current state
    const initial = communicationService.getZoneMembers();
    const built = buildNodes(initial);
    setNodes(built);
    setIsActive(built.length > 1);

    const unsub = communicationService.onZoneMembers((members) => {
      const built = buildNodes(members);
      setNodes(built);
      setIsActive(built.length > 1);
    });
    return unsub;
  }, [buildNodes]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    timeRef.current += 0.02;
    const t = timeRef.current;

    // Background
    ctx.fillStyle = 'hsl(120, 5%, 5%)';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'hsl(120, 40%, 12%)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    if (nodes.length === 0 || (nodes.length === 1 && nodes[0].isSelf)) {
      ctx.fillStyle = 'hsl(120, 30%, 30%)';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AWAITING ZONE PEERS...', W / 2, H / 2);
      ctx.fillText('Start CLI to see mesh', W / 2, H / 2 + 18);

      // Still draw self node
      if (nodes.length === 1) {
        const n = nodes[0];
        const nx = n.x * W; const ny = n.y * H;
        ctx.beginPath();
        ctx.fillStyle = 'hsl(120, 100%, 50%)';
        ctx.shadowColor = 'hsl(120, 100%, 50%)';
        ctx.shadowBlur = 12;
        ctx.arc(nx, ny, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'hsl(120, 80%, 60%)';
        ctx.fillText(n.name, nx, ny + 22);
      }
      return;
    }

    const self = nodes.find(n => n.isSelf);
    const peers = nodes.filter(n => !n.isSelf);

    // Draw connections from self to each peer
    peers.forEach(peer => {
      const sx = self ? self.x * W : W / 2;
      const sy = self ? self.y * H : H / 2;
      const px = peer.x * W;
      const py = peer.y * H;

      ctx.beginPath();
      ctx.strokeStyle = peer.isWebRTC
        ? `hsl(120, 60%, 25%)`
        : `hsla(60, 100%, 50%, 0.4)`; // yellow for CLI
      ctx.lineWidth = peer.isWebRTC ? 1 : 1;
      ctx.setLineDash(peer.isWebRTC ? [] : [4, 4]); // dashed for CLI
      ctx.moveTo(sx, sy);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.setLineDash([]);

      // Animated packet dot traveling along the line
      const progress = (Math.sin(t * 1.5 + peers.indexOf(peer)) + 1) / 2;
      const dotX = sx + (px - sx) * progress;
      const dotY = sy + (py - sy) * progress;
      ctx.beginPath();
      ctx.fillStyle = peer.isWebRTC
        ? `hsla(120, 100%, 50%, ${0.8 - progress * 0.5})`
        : `hsla(60, 100%, 50%, ${0.8 - progress * 0.5})`;
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw all nodes
    nodes.forEach(node => {
      const nx = node.x * W;
      const ny = node.y * H;
      const radius = node.isSelf ? 8 : 6;

      // Pulse ring for self
      if (node.isSelf) {
        const pulseR = 18 + Math.sin(t * 3) * 4;
        ctx.beginPath();
        ctx.strokeStyle = `hsla(120, 100%, 50%, ${0.2 + Math.sin(t * 2) * 0.1})`;
        ctx.lineWidth = 1;
        ctx.arc(nx, ny, pulseR, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.beginPath();
      if (node.isSelf) {
        ctx.fillStyle = 'hsl(120, 100%, 50%)';
        ctx.shadowColor = 'hsl(120, 100%, 50%)';
        ctx.shadowBlur = 12;
      } else if (node.isWebRTC) {
        ctx.fillStyle = 'hsl(120, 80%, 40%)';
        ctx.shadowColor = 'hsl(120, 100%, 50%)';
        ctx.shadowBlur = 6;
      } else {
        // CLI peer — yellow
        ctx.fillStyle = 'hsl(60, 100%, 50%)';
        ctx.shadowColor = 'hsl(60, 100%, 50%)';
        ctx.shadowBlur = 6;
      }

      ctx.arc(nx, ny, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = node.isWebRTC || node.isSelf ? 'hsl(120, 80%, 60%)' : 'hsl(60, 100%, 70%)';
      ctx.fillText(node.name, nx, ny + radius + 14);

      // CLI badge
      if (!node.isSelf && !node.isWebRTC) {
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = 'hsl(60, 100%, 60%)';
        ctx.fillText('CLI', nx, ny - radius - 5);
      }
    });

    // HUD
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'hsl(120, 40%, 35%)';
    ctx.fillText(`NODES: ${nodes.length}`, 8, 14);
    ctx.fillText(`LINKS: ${peers.length}`, 8, 26);
    ctx.textAlign = 'right';
    ctx.fillText('MESH://TOPOLOGY', W - 8, 14);
  }, [nodes]);

  useEffect(() => {
    const loop = () => {
      draw();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  return (
    <div className="border border-border bg-card rounded-sm overflow-hidden" style={{ boxShadow: 'var(--terminal-glow)' }}>
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs text-foreground glow-text">MESH://TOPOLOGY</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{nodes.length} nodes</span>
          <motion.div
            animate={{ opacity: isActive ? [0.5, 1, 0.5] : 0.3 }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className={`w-2 h-2 rounded-full ${isActive ? 'bg-primary' : 'bg-muted-foreground'}`}
          />
        </div>
      </div>
      <canvas ref={canvasRef} className="w-full" style={{ height: '200px' }} />
      {/* Legend */}
      <div className="px-3 py-1 border-t border-border flex gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="text-primary">●</span> WebRTC</span>
        <span className="flex items-center gap-1"><span className="text-yellow-500">●</span> CLI</span>
        <span className="flex items-center gap-1"><span className="text-primary">—</span> direct</span>
        <span className="flex items-center gap-1"><span className="text-yellow-500">- -</span> relay</span>
      </div>
    </div>
  );
};

export default MeshTopology;
