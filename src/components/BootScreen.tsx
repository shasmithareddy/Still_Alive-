import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const BOOT_LINES = [
  '> STILLALIVE MESH NETWORK v2.7.1',
  '> Initializing kernel modules...',
  '> Loading communication protocols...',
  '> WebRTC engine............... [OK]',
  '> P2P mesh layer.............. [OK]',
  '> Encryption module........... [OK]',
  '> GPS subsystem............... [OK]',
  '> SOS broadcast module........ [OK]',
  '> Network interface ready',
  '> Awaiting node identification...',
];

interface BootScreenProps {
  onComplete: (username: string) => void;
}

const BootScreen = ({ onComplete }: BootScreenProps) => {
  const [lines, setLines] = useState<string[]>([]);
  const [bootDone, setBootDone] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    let i = 0;
    let cancelled = false;
    const interval = setInterval(() => {
      if (cancelled) return;
      if (i < BOOT_LINES.length) {
        const line = BOOT_LINES[i];
        i++;
        setLines(prev => [...prev, line]);
      } else {
        clearInterval(interval);
        setBootDone(true);
      }
    }, 150);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) onComplete(username.trim());
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 scanlines">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-2xl"
      >
        <div className="border border-border p-6 bg-card rounded-sm" style={{ boxShadow: 'var(--terminal-glow)' }}>
          <div className="space-y-1 text-sm">
            {lines.map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`font-mono ${line.includes('[OK]') ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {line}
              </motion.div>
            ))}
          </div>

          <AnimatePresence>
            {bootDone && (
              <motion.form
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                onSubmit={handleSubmit}
                className="mt-6 space-y-4"
              >
                <div className="text-foreground glow-text text-sm">
                  {'>'} ENTER NODE IDENTIFIER:
                </div>
                <div className="flex gap-2">
                  <span className="text-foreground glow-text">$</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none text-foreground font-mono text-sm caret-primary"
                    autoFocus
                    placeholder="callsign..."
                  />
                </div>
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-2 border border-border text-foreground font-mono text-sm hover:bg-secondary transition-colors"
                  style={{ boxShadow: 'var(--terminal-glow)' }}
                >
                  [ INITIALIZE NODE ]
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default BootScreen;
