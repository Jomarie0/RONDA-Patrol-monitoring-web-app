import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as ronda from '../api/ronda';
import 'leaflet/dist/leaflet.css';
import './LiveMap.css';

const DEFAULT_CENTER = [14.7269, 121.8656]; // Quezon Province center
const DEFAULT_ZOOM = 9;
const REFRESH_MS = 5000; // Base interval (will be adapted)
const SMART_POLL_INTERVAL = 15000; // 15 seconds when no active drivers

// Calculate total distance traveled in GPS trail (in km)
function calculateTrailDistance(points) {
  if (!points || points.length < 2) return 0;
  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    const lat1 = points[i-1].latitude;
    const lon1 = points[i-1].longitude;
    const lat2 = points[i].latitude;
    const lon2 = points[i].longitude;
    
    // Haversine formula
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    totalDistance += R * c;
  }
  return totalDistance;
}

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

function MapCenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom());
  }, [map, center]);
  return null;
}

function MapZoomToDriver({ driverName, locations }) {
  const map = useMap();
  useEffect(() => {
    if (driverName && locations.length > 0) {
      const driver = locations.find(loc => loc.driver === driverName);
      if (driver && driver.latitude && driver.longitude) {
        map.setView([driver.latitude, driver.longitude], 15);
      }
    }
  }, [map, driverName, locations]);
  return null;
}

// Persistent trail component that maintains state across updates
function PersistentTrail({ sessionId, recentPoints }) {
  const [trail, setTrail] = useState([]);
  const polylineRef = useRef(null);

  useEffect(() => {
    if (!recentPoints || recentPoints.length === 0) return;

    // Convert to [lat, lng] format
    const newPoints = recentPoints.map(p => [p.latitude, p.longitude]);
    
    // Check if we have new points to append
    if (trail.length === 0) {
      // First time, set the entire trail
      setTrail(newPoints);
    } else {
      // Only update if we have more points than before
      if (newPoints.length > trail.length) {
        const newPointsCount = newPoints.length - trail.length;
        setTrail(newPoints);
      }
    }
  }, [recentPoints, trail.length]);

  return (
    <>
      {trail.length > 1 && (
        <Polyline
          ref={polylineRef}
          positions={trail}
          color="#ff6b35"
          weight={4}
          opacity={0.8}
        />
      )}
    </>
  );
}

function LiveMarkers({ locations, branchFilter }) {
  const filtered = branchFilter
    ? locations.filter((l) => l.branch === branchFilter)
    : locations;

  const withGPS = filtered.filter((l) => l.latitude != null && l.longitude != null);
  const withoutGPS = filtered.filter((l) => l.latitude == null || l.longitude == null);

  const groupedByCoords = {};
  withGPS.forEach((loc) => {
    const key = `${loc.latitude.toFixed(6)},${loc.longitude.toFixed(6)}`;
    if (!groupedByCoords[key]) {
      groupedByCoords[key] = [];
    }
    groupedByCoords[key].push(loc);
  });

  return (
    <>
      {Object.entries(groupedByCoords).map(([coordKey, locs]) => {
        const [lat, lng] = coordKey.split(',').map(parseFloat);
        
        return locs.map((loc, index) => {
          const offset = index * 0.0001;
          const position = [lat + offset, lng + offset];
          
          return (
            <React.Fragment key={`${loc.session_id}-${index}`}>
              {/* Persistent trail that maintains state */}
              <PersistentTrail 
                sessionId={loc.session_id} 
                recentPoints={loc.recent_points || []}
              />
              
              {/* Current position marker */}
              <Marker position={position}>
                <Popup>
                  <strong>{loc.driver}</strong><br />
                  {loc.vehicle} — {loc.branch}<br />
                  {loc.timestamp ? new Date(loc.timestamp).toLocaleString() : '—'}<br />
                  <strong>Coordinates:</strong><br />
                  Lat: {loc.latitude?.toFixed(6) || 'N/A'}<br />
                  Lng: {loc.longitude?.toFixed(6) || 'N/A'}<br />
                  {loc.recent_points && loc.recent_points.length > 0 && (
                    <>
                      <br />Trail points: {loc.recent_points.length}
                      {loc.recent_points.length > 1 && (
                        <>
                          <br />Distance: {calculateTrailDistance(loc.recent_points).toFixed(2)} km
                        </>
                      )}
                    </>
                  )}
                </Popup>
              </Marker>
            </React.Fragment>
          );
        });
      })}
      
      {withoutGPS.map((loc) => {
        const defaultPosition = [14.7269, 121.8656]; // Quezon Province center
        return (
          <Marker key={`no-gps-${loc.session_id}`} position={defaultPosition}>
            <Popup>
              <strong>{loc.driver}</strong><br />
              {loc.vehicle} — {loc.branch}<br />
              <span style={{color: 'red'}}>No GPS data available</span>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export function LiveMap({ branchFilter, onBranchFilterChange, branches }) {
  const [locations, setLocations] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState('');
  const fetchRef = useRef(null);

  const fetchLive = useCallback(async () => {
    try {
      const [liveData, sessionsData] = await Promise.all([
        ronda.sessions.live(),
        ronda.sessions.list(),
      ]);
      
      // Count active drivers with GPS
      const activeDriversWithGPS = liveData.filter(loc => loc.latitude != null && loc.longitude != null);
      const hasActiveDrivers = activeDriversWithGPS.length > 0;
      
      setLocations(liveData);
      setAllSessions(sessionsData);
      setLastUpdate(new Date());
      setError(null); // Clear any previous errors
      
      // Return polling decision for useEffect
      return hasActiveDrivers ? REFRESH_MS : SMART_POLL_INTERVAL;
    } catch (e) {
      const errorMessage = e.message || 'Failed to load live GPS data';
      setError(errorMessage);
      
      // Don't change locations on error, keep last known data
      
      // Return slower polling on error to reduce server load
      return SMART_POLL_INTERVAL * 2; // Even slower on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let currentInterval = REFRESH_MS;
    let isMounted = true;
    
    const setupPolling = async () => {
      if (!isMounted) return;
      
      try {
        const nextInterval = await fetchLive();
        
        if (!isMounted) return;
        
        // Only update interval if it changed significantly
        if (Math.abs(nextInterval - currentInterval) > 1000) {
          currentInterval = nextInterval;
          
          // Clear existing interval
          if (fetchRef.current) {
            clearInterval(fetchRef.current);
          }
          
          // Set new interval
          fetchRef.current = setInterval(async () => {
            if (!isMounted) return;
            await setupPolling();
          }, currentInterval);
        }
      } catch (error) {
        if (isMounted) {
          setError('Failed to setup polling');
        }
      }
    };
    
    // Initial setup
    setupPolling();
    
    // Cleanup
    return () => {
      isMounted = false;
      if (fetchRef.current) {
        clearInterval(fetchRef.current);
        fetchRef.current = null;
      }
    };
  }, [fetchLive]);

  const displayList = branchFilter
    ? [...locations.filter((l) => l.branch === branchFilter), ...allSessions.filter((s) => s.branch_name && !locations.some((l) => l.session_id === s.id)).map((s) => ({ session_id: s.id, driver: s.driver_username, vehicle: s.vehicle_plate, branch: s.branch_name || s.branch, latitude: null, longitude: null, timestamp: null, is_active: s.is_active }))]
    : locations;

  const withCoords = displayList.filter((l) => l.latitude != null && l.longitude != null);
  const center = withCoords.length ? [withCoords[0].latitude, withCoords[0].longitude] : DEFAULT_CENTER;

  // Get unique active drivers for dropdown
  const activeDrivers = [...new Set(locations.filter(l => l.latitude != null && l.longitude != null).map(l => l.driver))];

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
        
        {activeDrivers.length > 0 && (
          <select
            value={selectedDriver}
            onChange={(e) => setSelectedDriver(e.target.value)}
            className="live-map-select"
            style={{ marginLeft: '10px' }}
          >
            <option value="">Select driver to zoom</option>
            {activeDrivers.map((driver) => (
              <option key={driver} value={driver}>{driver}</option>
            ))}
          </select>
        )}
        
        <span className="live-map-updated">
          Real-time updates every 5s. Last: {lastUpdate ? lastUpdate.toLocaleTimeString() : '—'}
        </span>
      </div>
      <MapContainer center={center} zoom={DEFAULT_ZOOM} className="live-map" scrollWheelZoom>
        <FixLeafletIcons />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <LiveMarkers locations={locations} branchFilter={branchFilter} />
        <MapCenter center={center} />
        <MapZoomToDriver driverName={selectedDriver} locations={locations} />
      </MapContainer>
      <div className="live-map-legend">
        <span className="badge active">Active</span> Has recent GPS
        <span className="badge inactive" style={{ marginLeft: '1rem' }}>Inactive</span> No recent position
      </div>
    </div>
  );
}
