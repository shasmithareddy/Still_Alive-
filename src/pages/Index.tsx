import { useState, useEffect } from 'react';
import BootScreen from '@/components/BootScreen';
import AppLayout from '@/components/AppLayout';
import { communicationService } from '@/services/communicationService';
import { getOfflineModeManager } from '@/services/offlineModeManager';

const Index = () => {
  const [booted, setBooted] = useState(false);

  const handleBoot = async (username: string) => {
    try {
      await communicationService.init(username);
      
      // Initialize offline mode manager in background (non-blocking)
      // This way the UI loads immediately even if mesh initialization fails
      const offlineManager = getOfflineModeManager();
      offlineManager.init(communicationService).catch(err => {
        console.warn('⚠️ Offline mode failed to initialize:', err);
        // App still works, just without offline features
      });
      
      setBooted(true);
    } catch (err) {
      console.error('Failed to initialize:', err);
      // Still proceed so UI is usable
      setBooted(true);
    }
  };

  if (!booted) return <BootScreen onComplete={handleBoot} />;
  return <AppLayout />;
};

export default Index;
