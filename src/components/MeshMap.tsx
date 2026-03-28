import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { communicationService, LocationData } from '@/services/communicationService';

// Fix leaflet default icon
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)['_getIconUrl'];
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function LocationUpdater({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, 15);
  }, [position, map]);
  return null;
}

const MeshMap = () => {
  const [myPos, setMyPos] = useState<[number, number] | null>(null);
  const [peerLocations, setPeerLocations] = useState<Map<string, LocationData>>(new Map());

  useEffect(() => {
    if ('geolocation' in navigator) {
      const watcher = navigator.geolocation.watchPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setMyPos(coords);
          communicationService.sendLocation({ lat: coords[0], lng: coords[1] });
        },
        () => setMyPos([28.6139, 77.2090]), // Default: Delhi
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watcher);
    } else {
      setMyPos([28.6139, 77.2090]);
    }
  }, []);

  useEffect(() => {
    const unsub = communicationService.onLocation((data) => {
      setPeerLocations(prev => new Map(prev).set(data.sender, data));
    });
    return unsub;
  }, []);

  const center: [number, number] = myPos || [28.6139, 77.2090];

  return (
    <div className="h-full border border-border rounded-sm overflow-hidden" style={{ boxShadow: 'var(--terminal-glow)' }}>
      <div className="px-3 py-2 border-b border-border bg-card">
        <span className="text-xs text-foreground glow-text">MESH://MAP</span>
      </div>
      <MapContainer center={center} zoom={13} className="h-[calc(100%-32px)] w-full" zoomControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <LocationUpdater position={myPos} />
        {myPos && (
          <Marker position={myPos} icon={greenIcon}>
            <Popup>
              <span className="font-mono text-xs">YOU ({communicationService.getUsername()})</span>
            </Popup>
          </Marker>
        )}
        {Array.from(peerLocations.entries()).map(([sender, loc]) => (
          <Marker key={sender} position={[loc.lat, loc.lng]}>
            <Popup>
              <span className="font-mono text-xs">{sender}</span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default MeshMap;
