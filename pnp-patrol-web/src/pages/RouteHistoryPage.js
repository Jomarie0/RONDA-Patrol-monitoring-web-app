import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as ronda from '../api/ronda';
import 'leaflet/dist/leaflet.css';
import './RouteHistoryPage.css';

function FixLeafletIcons() {
  useEffect(() => {
    if (typeof L !== 'undefined' && L.Icon?.Default) {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });
    }
  }, []);
  return null;
}

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions && positions.length > 1) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [map, positions]);
  return null;
}

const DEFAULT_CENTER = [14.7269, 121.8656]; // Quezon Province center
const DEFAULT_ZOOM = 9;

export function RouteHistoryPage() {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [gpsLogs, setGpsLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSessions = useCallback(() => {
    ronda.sessions
      .list()
      .then(setSessions)
      .catch((e) => setError(e.message || 'Failed to load sessions'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!selectedId) {
      setGpsLogs([]);
      return;
    }
    ronda.gpsLogs.list({ session: selectedId }).then((data) => {
      const ordered = Array.isArray(data) ? data : data.results || [];
      ordered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      setGpsLogs(ordered);
    });
  }, [selectedId]);

  const positions = gpsLogs
    .filter((g) => g.latitude != null && g.longitude != null)
    .map((g) => [Number(g.latitude), Number(g.longitude)]);

  if (loading) return <div className="route-loading">Loading sessions…</div>;
  if (error) return <div className="route-error">{error}</div>;

  return (
    <div className="route-history-page">
      <h2>Route History Playback</h2>
      <p className="route-desc">Select a session to draw its GPS route on the map.</p>
      <div className="route-layout">
        <div className="route-session-list">
          <label className="route-label">Session</label>
          <select
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            className="route-select"
          >
            <option value="">— Select session —</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.driver_username || s.driver} — {s.branch_name || s.branch} — {s.start_time ? new Date(s.start_time).toLocaleDateString() : ''}
              </option>
            ))}
          </select>
          {selectedId && (
            <p className="route-points">{gpsLogs.length} GPS point(s)</p>
          )}
        </div>
        <div className="route-map-wrap">
          <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="route-map" scrollWheelZoom>
            <FixLeafletIcons />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {positions.length > 0 && (
              <>
                <Polyline positions={positions} color="#1e3a5f" weight={4} opacity={0.8} />
                <FitBounds positions={positions} />
              </>
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
