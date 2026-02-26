import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as ronda from '../api/ronda';
import { LiveMap } from '../components/LiveMap';
import './MapPage.css';

export function MapPage() {
  const { user } = useAuth();
  const [branchFilter, setBranchFilter] = useState(null);
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') {
      ronda.branches.list().then(setBranches);
    } else {
      setBranches([]);
    }
  }, [user?.role]);

  return (
    <div className="map-page">
      <h2>Live Map</h2>
      <p className="map-page-desc">Patrol vehicles (refreshes every 60 seconds). Status: Active = has recent GPS.</p>
      <LiveMap
        branchFilter={branchFilter}
        onBranchFilterChange={setBranchFilter}
        branches={branches}
      />
    </div>
  );
}
