import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { communicationService } from '@/services/communicationService';

const SOSButton = () => {
  const [active, setActive] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdTimer, setHoldTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  const startHold = () => {
    let progress = 0;
    const timer = setInterval(() => {
      progress += 2;
      setHoldProgress(progress);
      if (progress >= 100) {
        clearInterval(timer);
        triggerSOS();
      }
    }, 30);
    setHoldTimer(timer);
  };

  const cancelHold = () => {
    if (holdTimer) clearInterval(holdTimer);
    setHoldProgress(0);
    setHoldTimer(null);
  };

  const triggerSOS = () => {
    setActive(true);
    setHoldProgress(0);
    setHoldTimer(null);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => communicationService.sendSOS({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => communicationService.sendSOS()
      );
    } else {
      communicationService.sendSOS();
    }

    setTimeout(() => setActive(false), 5000);
  };

  return (
    <div className="relative">
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 -m-4 rounded-sm bg-destructive/10 border border-destructive sos-pulse z-0"
          />
        )}
      </AnimatePresence>

      <motion.button
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
        whileTap={{ scale: 0.95 }}
        className={`relative z-10 w-full py-4 border-2 rounded-sm font-mono text-sm font-bold transition-colors ${
          active
            ? 'border-destructive text-destructive glow-text-red bg-destructive/10'
            : 'border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/5'
        }`}
      >
        {active ? (
          <span className="glow-text-red">🚨 SOS BROADCAST ACTIVE 🚨</span>
        ) : holdProgress > 0 ? (
          <span>HOLD TO CONFIRM... {holdProgress}%</span>
        ) : (
          <span>[ HOLD ] SOS EMERGENCY</span>
        )}

        {/* Progress bar */}
        {holdProgress > 0 && !active && (
          <div className="absolute bottom-0 left-0 h-0.5 bg-destructive transition-all" style={{ width: `${holdProgress}%` }} />
        )}
      </motion.button>
    </div>
  );
};

export default SOSButton;
