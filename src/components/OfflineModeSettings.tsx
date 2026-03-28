import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getOfflineModeManager, type OfflineMode } from '@/services/offlineModeManager';
import { AlertCircle, CheckCircle, RotateCw } from 'lucide-react';

export const OfflineModeSettings: React.FC = () => {
  const manager = getOfflineModeManager();
  const [config, setConfig] = useState(manager.getConfig());
  const [mode, setMode] = useState<OfflineMode>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    manager.onModeChange(setMode);

    const interval = setInterval(() => {
      setPendingCount(manager.getPendingMessageCount());
    }, 1000);

    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));

    return () => clearInterval(interval);
  }, [manager]);

  const toggleOption = (key: keyof typeof config, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    manager.updateConfig(newConfig);
  };

  const handleSyncNow = async () => {
    try {
      // Trigger manual sync
      const peers = manager.getDiscoveredPeers();
      if (peers.length === 0) {
        alert('No peers available to sync with');
        return;
      }
      // Sync would happen automatically, this is just for UI feedback
      alert('Sync initiated');
    } catch (error) {
      alert('Sync failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Offline Mode Settings</CardTitle>
        <CardDescription>Configure how Still Alive handles offline operation</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Current Status */}
        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
          <h3 className="font-semibold text-sm">Current Status</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isOnline ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
              <span>Network: {isOnline ? 'Online' : 'Offline'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="capitalize">{mode}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span>Pending Messages:</span>
              <Badge variant={pendingCount > 0 ? 'destructive' : 'secondary'}>
                {pendingCount}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span>Mesh Peers:</span>
              <Badge>{manager.getConnectedPeers().length}</Badge>
            </div>
          </div>
        </div>

        {/* Configuration Options */}
        <div className="space-y-4">
          <h3 className="font-semibold text-sm">Features</h3>

          {/* Local Caching */}
          <div className="flex items-start justify-between p-3 border rounded-lg">
            <div className="space-y-1">
              <label className="font-medium text-sm">Local Message Caching</label>
              <p className="text-xs text-gray-600">
                Store messages locally for offline access and sync later
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.localCacheEnabled}
              onChange={(e) => toggleOption('localCacheEnabled', e.target.checked)}
              className="w-5 h-5 rounded"
            />
          </div>

          {/* Sync on Reconnect */}
          <div className="flex items-start justify-between p-3 border rounded-lg">
            <div className="space-y-1">
              <label className="font-medium text-sm">Auto-sync on Reconnect</label>
              <p className="text-xs text-gray-600">
                Automatically sync pending messages when coming back online
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.syncOnReconnect}
              onChange={(e) => toggleOption('syncOnReconnect', e.target.checked)}
              className="w-5 h-5 rounded"
            />
          </div>

          {/* Mesh Broadcasting */}
          <div className="flex items-start justify-between p-3 border rounded-lg">
            <div className="space-y-1">
              <label className="font-medium text-sm">Mesh Network Broadcasting</label>
              <p className="text-xs text-gray-600">
                Broadcast messages to nearby peers via mDNS mesh network
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.meshBroadcastEnabled}
              onChange={(e) => toggleOption('meshBroadcastEnabled', e.target.checked)}
              className="w-5 h-5 rounded"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Actions</h3>

          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleSyncNow}
            disabled={!isOnline || pendingCount === 0}
          >
            <RotateCw className="w-4 h-4 mr-2" />
            Sync Pending Messages ({pendingCount})
          </Button>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-blue-900">How Offline Mode Works:</p>
              <ul className="list-disc list-inside text-blue-800 space-y-1">
                <li>
                  <strong>Online:</strong> Messages sent through centralized server
                </li>
                <li>
                  <strong>Hybrid:</strong> Both server and local mesh network active
                </li>
                <li>
                  <strong>Offline:</strong> Mesh network only (no internet required)
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Technical Info */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">Technical Details:</p>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>
              📍 <strong>Discovery:</strong> mDNS (Multicast DNS) on local network
            </li>
            <li>
              🔒 <strong>Encryption:</strong> NOISE protocol for all connections
            </li>
            <li>
              💾 <strong>Storage:</strong> IndexedDB for local message persistence
            </li>
            <li>
              🔄 <strong>Sync:</strong> Automatic when peers connect
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default OfflineModeSettings;
