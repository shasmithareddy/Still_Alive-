import { useState } from 'react';
import { motion } from 'framer-motion';
import { demoSimulator } from '@/services/demoSimulator';

const DemoButton = () => {
  const [active, setActive] = useState(false);

  const toggle = () => {
    if (active) {
      demoSimulator.stop();
    } else {
      demoSimulator.start();
    }
    setActive(!active);
  };

  return (
    <motion.button
      onClick={toggle}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`w-full py-2 border rounded-sm font-mono text-xs font-bold transition-all ${
        active
          ? 'border-primary text-primary-foreground bg-primary glow-text'
          : 'border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-foreground'
      }`}
    >
      {active ? '■ STOP SIMULATION' : '▶ SIMULATE DISASTER'}
    </motion.button>
  );
};

export default DemoButton;
