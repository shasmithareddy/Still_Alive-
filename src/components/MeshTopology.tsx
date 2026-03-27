import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { demoSimulator, SimulationState } from '@/services/demoSimulator';

const MeshTopology = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [simState, setSimState] = useState<SimulationState>(demoSimulator.getState());
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const unsub = demoSimulator.onUpdate(setSimState);
    return unsub;
  }, []);

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

    // Clear
    ctx.fillStyle = 'hsl(120, 5%, 5%)';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'hsl(120, 40%, 12%)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    const { nodes, packets } = simState;

    if (nodes.length === 0) {
      // Empty state
      ctx.fillStyle = 'hsl(120, 30%, 30%)';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AWAITING MESH DATA...', W / 2, H / 2);
      ctx.fillText('Start demo to visualize topology', W / 2, H / 2 + 18);
      return;
    }

    // Draw connections
    nodes.forEach(node => {
      const nx = node.x * W;
      const ny = node.y * H;
      node.connections.forEach(connId => {
        const target = nodes.find(n => n.id === connId);
        if (!target) return;
        const tx = target.x * W;
        const ty = target.y * H;

        ctx.beginPath();
        ctx.strokeStyle = node.isSOSActive || target.isSOSActive
          ? `hsla(0, 100%, 50%, ${0.4 + Math.sin(t * 5) * 0.3})`
          : 'hsl(120, 60%, 25%)';
        ctx.lineWidth = node.isSOSActive || target.isSOSActive ? 2 : 1;
        ctx.moveTo(nx, ny);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      });
    });

    // Draw packets (animated dots traveling along connections)
    packets.forEach(pkt => {
      const fromNode = nodes.find(n => n.id === pkt.from);
      const toNode = nodes.find(n => n.id === pkt.to);
      if (!fromNode || !toNode) return;

      const px = fromNode.x * W + (toNode.x * W - fromNode.x * W) * pkt.progress;
      const py = fromNode.y * H + (toNode.y * H - fromNode.y * H) * pkt.progress;

      ctx.beginPath();
      ctx.fillStyle = `hsla(120, 100%, 50%, ${1 - pkt.progress})`;
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();

      // Glow
      ctx.beginPath();
      ctx.fillStyle = `hsla(120, 100%, 50%, ${(1 - pkt.progress) * 0.3})`;
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw nodes
    nodes.forEach((node, i) => {
      const nx = node.x * W;
      const ny = node.y * H;
      const isSelf = i === 0;
      const isSOSNode = node.isSOSActive;

      // Outer ring pulse
      if (isSelf || isSOSNode) {
        const pulseR = 18 + Math.sin(t * 3) * 4;
        ctx.beginPath();
        ctx.strokeStyle = isSOSNode
          ? `hsla(0, 100%, 50%, ${0.3 + Math.sin(t * 5) * 0.2})`
          : `hsla(120, 100%, 50%, ${0.2 + Math.sin(t * 2) * 0.1})`;
        ctx.lineWidth = 1;
        ctx.arc(nx, ny, pulseR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Node circle
      const radius = isSelf ? 8 : 6;
      ctx.beginPath();

      if (isSOSNode) {
        ctx.fillStyle = `hsl(0, 100%, ${50 + Math.sin(t * 8) * 20}%)`;
        ctx.shadowColor = 'hsl(0, 100%, 50%)';
        ctx.shadowBlur = 15;
      } else if (isSelf) {
        ctx.fillStyle = 'hsl(120, 100%, 50%)';
        ctx.shadowColor = 'hsl(120, 100%, 50%)';
        ctx.shadowBlur = 12;
      } else {
        ctx.fillStyle = 'hsl(120, 80%, 40%)';
        ctx.shadowColor = 'hsl(120, 100%, 50%)';
        ctx.shadowBlur = 6;
      }

      ctx.arc(nx, ny, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isSOSNode ? 'hsl(0, 100%, 70%)' : 'hsl(120, 80%, 60%)';
      ctx.fillText(node.name, nx, ny + radius + 14);

      if (isSOSNode) {
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.fillStyle = `hsla(0, 100%, 50%, ${0.5 + Math.sin(t * 6) * 0.5})`;
        ctx.fillText('⚠ SOS', nx, ny - radius - 6);
      }
    });

    // HUD overlay
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'hsl(120, 40%, 35%)';
    ctx.fillText(`NODES: ${nodes.length}`, 8, 14);
    ctx.fillText(`LINKS: ${nodes.reduce((a, n) => a + n.connections.length, 0) / 2}`, 8, 26);
    ctx.fillText(`PKTS: ${packets.length}`, 8, 38);

    ctx.textAlign = 'right';
    ctx.fillText(`MESH://TOPOLOGY`, W - 8, 14);
  }, [simState]);

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
        <motion.div
          animate={{ opacity: simState.active ? [0.5, 1, 0.5] : 0.3 }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className={`w-2 h-2 rounded-full ${simState.active ? 'bg-primary' : 'bg-muted-foreground'}`}
        />
      </div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: '200px' }}
      />
    </div>
  );
};

export default MeshTopology;
