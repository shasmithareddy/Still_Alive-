import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { getOfflineModeManager, type OfflineMode } from '@/services/offlineModeManager';
import { Wifi, WifiOff, Zap, AlertCircle } from 'lucide-react';

export const OfflineModeToggle: React.FC = () => {
  const manager = getOfflineModeManager();
  const [mode, setMode] = useState<OfflineMode>('online');
  const [isNetworkOnline, setIsNetworkOnline] = useState(navigator.onLine);
  const [connectedPeers, setConnectedPeers] = useState(0);
  const [pendingMessages, setPendingMessages] = useState(0);

  useEffect(() => {
    // Subscribe to mode changes
    manager.onModeChange((newMode) => {
      setMode(newMode);
    });

    // Subscribe to network changes
    window.addEventListener('online', () => setIsNetworkOnline(true));
    window.addEventListener('offline', () => setIsNetworkOnline(false));

    // Poll for status updates
    const interval = setInterval(() => {
      setConnectedPeers(manager.getConnectedPeers().length);
      setPendingMessages(manager.getPendingMessageCount());
    }, 1000);

    return () => clearInterval(interval);
  }, [manager]);

  const handleSwitchMode = async (newMode: OfflineMode) => {
    try {
      await manager.switchMode(newMode);
      setMode(newMode);
    } catch (error) {
      console.error('Failed to switch mode:', error);
    }
  };

  const getModeIcon = () => {
    switch (mode) {
      case 'online':
        return <Wifi className="w-4 h-4" />;
      case 'offline':
        return <WifiOff className="w-4 h-4" />;
      case 'hybrid':
        return <Zap className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getModeColor = () => {
    switch (mode) {
      case 'online':
        return isNetworkOnline ? 'bg-green-500' : 'bg-yellow-500';
      case 'offline':
        return 'bg-red-500';
      case 'hybrid':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <DropdownMenu>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        title={`Mode: ${mode} | Network: ${isNetworkOnline ? 'Online' : 'Offline'}`}
      >
        {getModeIcon()}
        <span className="capitalize">{mode}</span>
        {mode !== 'online' && (
          <Badge className={`${getModeColor()} text-white ml-1`}>
            {mode === 'hybrid' && connectedPeers > 0 ? `${connectedPeers} 🔵` : ''}
            {mode === 'offline' && connectedPeers > 0 ? `${connectedPeers} 🔵` : ''}
          </Badge>
        )}
        {pendingMessages > 0 && (
          <Badge variant="destructive" className="ml-1">
            {pendingMessages} ⏳
          </Badge>
        )}
      </Button>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Connection Mode</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => handleSwitchMode('online')}
          disabled={!isNetworkOnline}
          className="gap-2"
        >
          <Wifi className="w-4 h-4" />
          <span>Online Only</span>
          {mode === 'online' && <Badge variant="default">Active</Badge>}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleSwitchMode('hybrid')}
          className="gap-2"
        >
          <Zap className="w-4 h-4" />
          <span>Hybrid (Online + Mesh)</span>
          {mode === 'hybrid' && <Badge variant="default">Active</Badge>}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleSwitchMode('offline')}
          className="gap-2"
        >
          <WifiOff className="w-4 h-4" />
          <span>Offline (Mesh Only)</span>
          {mode === 'offline' && <Badge variant="default">Active</Badge>}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <div className="px-2 py-2 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isNetworkOnline ? 'bg-green-500' : 'bg-gray-400'
              }`}
            />
            <span>Internet: {isNetworkOnline ? 'Connected' : 'Offline'}</span>
          </div>

          {(mode === 'offline' || mode === 'hybrid') && (
            <>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Mesh Peers: {connectedPeers}</span>
              </div>

              <div className="flex items-center gap-2">
                <AlertCircle className="w-3 h-3" />
                <span>Pending: {pendingMessages}</span>
              </div>
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default OfflineModeToggle;
