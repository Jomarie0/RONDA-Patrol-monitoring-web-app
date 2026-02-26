import React, { useState, useEffect } from 'react';
import * as ronda from '../api/ronda';
import './SessionsPage.css';

function formatDuration(start, end) {
  if (!start) return '—';
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const ms = e - s;
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

export function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    ronda.sessions
      .list()
      .then(setSessions)
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="sessions-loading">Loading…</div>;
  if (error) return <div className="sessions-error">{error}</div>;

  return (
    <div className="sessions-page">
      <h2>Session Logs</h2>
      <p className="sessions-desc">Driver sessions with start, end, and duration.</p>
      <div className="table-wrap">
        <table className="sessions-table">
          <thead>
            <tr>
              <th>Driver</th>
              <th>Branch</th>
              <th>Start time</th>
              <th>End time</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.driver_username || s.driver}</td>
                <td>{s.branch_name || s.branch}</td>
                <td>{s.start_time ? new Date(s.start_time).toLocaleString() : '—'}</td>
                <td>{s.end_time ? new Date(s.end_time).toLocaleString() : '—'}</td>
                <td>{formatDuration(s.start_time, s.end_time)}</td>
                <td>
                  <span className={`badge ${s.is_active ? 'active' : 'inactive'}`}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
