import { useState } from 'react';
import BootScreen from '@/components/BootScreen';
import AppLayout from '@/components/AppLayout';
import { communicationService } from '@/services/communicationService';

const Index = () => {
  const [booted, setBooted] = useState(false);

  const handleBoot = async (username: string) => {
    try {
      await communicationService.init(username);
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
