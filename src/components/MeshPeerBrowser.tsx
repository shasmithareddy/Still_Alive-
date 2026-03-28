import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getOfflineModeManager, type OfflineMode } from '@/services/offlineModeManager';
import { getMeshService, type MeshPeer } from '@/services/libp2pMesh';
import { Wifi, WifiOff, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export const MeshPeerBrowser: React.FC = () => {
  const manager = getOfflineModeManager();
  const meshService = getMeshService();
  const [mode, setMode] = useState<OfflineMode>('online');
  const [peers, setPeers] = useState<MeshPeer[]>([]);
  const [status, setStatus] = useState('Initializing...');

  useEffect(() => {
    // Subscribe to mode changes
    manager.onModeChange((newMode) => {
      setMode(newMode);
      if (newMode === 'online') {
        setPeers([]);
      }
    });

    // Subscribe to peer discovery
    meshService.onPeerDiscovered((peer) => {
      setPeers((prev) => {
        const existing = prev.findIndex((p) => p.peerId === peer.peerId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = peer;
          return updated;
        }
        return [...prev, peer];
      });
    });

    // Subscribe to status updates
    meshService.onStatusChange(setStatus);

    // Poll for peer updates
    const interval = setInterval(() => {
      if (mode !== 'online') {
        setPeers([...meshService.getPeers()]);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [manager, meshService, mode]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const formatAddress = (addr: string) => {
    // Extract IP and port from multiaddr
    const match = addr.match(/\/ip[46]\/([^/]+)\/.*\/(\d+)/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
    return addr;
  };

  if (mode === 'online') {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg">Mesh Network</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <Wifi className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Mesh network available in Hybrid or Offline mode</p>
            <p className="text-sm mt-2">Switch modes to discover nearby peers</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Mesh Network</CardTitle>
          <Badge className={peers.length > 0 ? 'bg-green-500' : 'bg-gray-500'}>
            {peers.length} Peers
          </Badge>
        </div>
        <p className="text-xs text-gray-500 mt-1">{status}</p>
      </CardHeader>

      <CardContent className="space-y-3">
        {peers.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <WifiOff className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No peers discovered yet</p>
            <p className="text-xs mt-1">Waiting for nearby devices...</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {peers.map((peer) => (
              <div
                key={peer.peerId}
                className="border rounded-lg p-3 space-y-2 hover:bg-gray-50 transition"
              >
                {/* Peer Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        peer.isConnected ? 'bg-green-500' : 'bg-gray-400'
                      }`}
                    />
                    <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                      {peer.peerId.slice(0, 16)}...
                    </code>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(peer.peerId)}
                    title="Copy Peer ID"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>

                {/* addresses */}
                {peer.addresses.length > 0 && (
                  <div className="ml-4 space-y-1">
                    <p className="text-xs text-gray-600 font-semibold">Addresses:</p>
                    {peer.addresses.slice(0, 2).map((addr, idx) => (
                      <div key={idx} className="flex items-center gap-2 ml-2">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded flex-1 break-all">
                          {formatAddress(addr)}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(addr)}
                          title="Copy address"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    {peer.addresses.length > 2 && (
                      <p className="text-xs text-gray-500 ml-2">
                        +{peer.addresses.length - 2} more
                      </p>
                    )}
                  </div>
                )}

                {/* Status */}
                <div className="ml-4 flex items-center gap-2 text-xs">
                  <Badge variant={peer.isConnected ? 'default' : 'secondary'}>
                    {peer.isConnected ? 'Connected' : 'Discovered'}
                  </Badge>
                  <span className="text-gray-500">
                    Last seen: {new Date(peer.lastSeen).toLocaleTimeString()}
                  </span>
                </div>

                {/* Actions */}
                {!peer.isConnected && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs mt-2"
                    onClick={() => {
                      meshService.connectToPeer(peer.peerId).catch((err) => {
                        console.error('Connection failed:', err);
                        toast.error('Failed to connect to peer');
                      });
                    }}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Connect
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Info Footer */}
        <div className="text-xs text-gray-500 pt-3 border-t space-y-1">
          <p>💡 Peers are discovered automatically via mDNS on your local network</p>
          <p>🔒 All communications are encrypted end-to-end</p>
          <p>📦 Messages are stored locally and synced when peers connect</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default MeshPeerBrowser;
