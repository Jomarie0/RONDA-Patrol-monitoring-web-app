import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as ronda from '../api/ronda';
import './DashboardPage.css';

export function DashboardPage() {
  const { user } = useAuth();
  const [live, setLive] = useState([]);
  const [sessionsCount, setSessionsCount] = useState({ active: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const [liveData, sessionsData] = await Promise.all([
          ronda.sessions.live(),
          ronda.sessions.list(),
        ]);
        if (cancelled) return;
        setLive(liveData);
        const active = sessionsData.filter((s) => s.is_active).length;
        setSessionsCount({ active, total: sessionsData.length });
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="dashboard-loading">Loading…</div>;
  if (error) return <div className="dashboard-error">{error}</div>;

  return (
    <div className="dashboard">
      <h2>Dashboard</h2>
      <p className="dashboard-welcome">Welcome, {user?.username} ({user?.role?.replace('_', ' ')})</p>
      <div className="dashboard-cards">
        <div className="card">
          <span className="card-value">{live.length}</span>
          <span className="card-label">Active vehicles (live)</span>
        </div>
        <div className="card">
          <span className="card-value">{sessionsCount.active}</span>
          <span className="card-label">Active sessions</span>
        </div>
        <div className="card">
          <span className="card-value">{sessionsCount.total}</span>
          <span className="card-label">Total sessions</span>
        </div>
      </div>
      <div className="dashboard-section">
        <h3>Recent live locations</h3>
        {live.length === 0 ? (
          <p className="muted">No active patrols right now.</p>
        ) : (
          <ul className="live-list">
            {live.map((item) => (
              <li key={item.session_id}>
                <span className="badge active">Active</span>
                {item.driver} — {item.vehicle} ({item.branch})
                {item.timestamp && (
                  <span className="live-time">Updated {new Date(item.timestamp).toLocaleString()}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
