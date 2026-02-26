import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as ronda from '../api/ronda';
import 'leaflet/dist/leaflet.css';
import './LiveMap.css';

const DEFAULT_CENTER = [14.5995, 120.9842];
const DEFAULT_ZOOM = 11;
const REFRESH_MS = 60000;

function FixLeafletIcons() {
  useEffect(() => {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });
  }, []);
  return null;
}

function LiveMarkers({ locations, branchFilter }) {
  const filtered = branchFilter
    ? locations.filter((l) => l.branch === branchFilter)
    : locations;

  return (
    <>
      {filtered.filter((l) => l.latitude != null && l.longitude != null).map((loc) => (
        <Marker key={loc.session_id} position={[loc.latitude, loc.longitude]}>
          <Popup>
            <strong>{loc.driver}</strong><br />
            {loc.vehicle} — {loc.branch}<br />
            {loc.timestamp ? new Date(loc.timestamp).toLocaleString() : '—'}
          </Popup>
        </Marker>
      ))}
    </>
  );
}

function MapCenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom());
  }, [map, center]);
  return null;
}

export function LiveMap({ branchFilter, onBranchFilterChange, branches }) {
  const [locations, setLocations] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const fetchRef = useRef(null);

  const fetchLive = useCallback(async () => {
    try {
      const [liveData, sessionsData] = await Promise.all([
        ronda.sessions.live(),
        ronda.sessions.list(),
      ]);
      setLocations(liveData);
      setAllSessions(sessionsData);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    fetchRef.current = setInterval(fetchLive, REFRESH_MS);
    return () => clearInterval(fetchRef.current);
  }, [fetchLive]);

  const displayList = branchFilter
    ? [...locations.filter((l) => l.branch === branchFilter), ...allSessions.filter((s) => s.branch_name && !locations.some((l) => l.session_id === s.id)).map((s) => ({ session_id: s.id, driver: s.driver_username, vehicle: s.vehicle_plate, branch: s.branch_name || s.branch, latitude: null, longitude: null, timestamp: null, is_active: s.is_active }))]
    : locations;

  const withCoords = displayList.filter((l) => l.latitude != null && l.longitude != null);
  const center = withCoords.length ? [withCoords[0].latitude, withCoords[0].longitude] : DEFAULT_CENTER;

  if (loading) return <div className="live-map-loading">Loading map…</div>;
  if (error) return <div className="live-map-error">{error}</div>;

  return (
    <div className="live-map-wrap">
      <div className="live-map-toolbar">
        {branches && branches.length > 0 && onBranchFilterChange && (
          <select
            value={branchFilter || ''}
            onChange={(e) => onBranchFilterChange(e.target.value || null)}
            className="live-map-select"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.code}>{b.name}</option>
            ))}
          </select>
        )}
        <span className="live-map-updated">
          Refreshes every 60s. Last: {lastUpdate ? lastUpdate.toLocaleTimeString() : '—'}
        </span>
      </div>
      <MapContainer center={center} zoom={DEFAULT_ZOOM} className="live-map" scrollWheelZoom>
        <FixLeafletIcons />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <LiveMarkers locations={locations} branchFilter={branchFilter} />
        <MapCenter center={center} />
      </MapContainer>
      <div className="live-map-legend">
        <span className="badge active">Active</span> Has recent GPS
        <span className="badge inactive" style={{ marginLeft: '1rem' }}>Inactive</span> No recent position
      </div>
    </div>
  );
}
