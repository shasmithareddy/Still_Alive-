import { useState } from 'react';
import { motion } from 'framer-motion';
import TerminalChat from './TerminalChat';
import SOSButton from './SOSButton';
import MeshMap from './MeshMap';
import NetworkStatus from './NetworkStatus';
import MeshTopology from './MeshTopology';
import DemoButton from './DemoButton';

type Tab = 'chat' | 'map' | 'mesh';

const AppLayout = () => {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  return (
    <div className="h-screen flex flex-col bg-background scanlines crt-flicker">
      {/* Top bar */}
      <div className="border-b border-border px-4 py-2 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-foreground glow-text tracking-widest">STILLALIVE</span>
          <span className="text-xs text-muted-foreground">v2.7.1</span>
        </div>
        <div className="flex gap-1">
          {(['chat', 'map', 'mesh'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs font-mono border rounded-sm transition-colors ${
                activeTab === tab
                  ? 'border-primary text-foreground bg-secondary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
              }`}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop: side by side */}
        <div className="hidden lg:flex flex-1 gap-2 p-2">
          {/* Left: Chat */}
          <div className="flex-1 flex flex-col">
            <TerminalChat />
          </div>

          {/* Right sidebar */}
          <div className="w-80 flex flex-col gap-2">
            <NetworkStatus />
            <MeshTopology />
            <div className="flex-1 min-h-0">
              <MeshMap />
            </div>
            <DemoButton />
            <SOSButton />
          </div>
        </div>

        {/* Mobile view */}
        <div className="lg:hidden flex-1 flex flex-col p-2 gap-2">
          {activeTab === 'chat' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col gap-2">
              <NetworkStatus />
              <div className="flex-1">
                <TerminalChat />
              </div>
              <DemoButton />
              <SOSButton />
            </motion.div>
          )}
          {activeTab === 'map' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1">
              <MeshMap />
            </motion.div>
          )}
          {activeTab === 'mesh' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col gap-2">
              <MeshTopology />
              <DemoButton />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
