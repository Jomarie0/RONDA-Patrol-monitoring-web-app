import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as ronda from '../api/ronda';
import './VehiclesPage.css';

export function VehiclesPage() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    branch: '',
    plate_number: '',
    name: '',
  });

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const branchOptions = isSuperAdmin ? branches : branches.filter((b) => b.id === user?.branchId);

  useEffect(() => {
    async function load() {
      try {
        const [v, b] = await Promise.all([ronda.vehicles.list(), ronda.branches.list()]);
        setVehicles(Array.isArray(v) ? v : v.results || []);
        setBranches(b);
        if (!isSuperAdmin && user?.branchId) setForm((prev) => ({ ...prev, branch: String(user.branchId) }));
      } catch (e) {
        setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isSuperAdmin, user?.branchId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.plate_number.trim()) {
      setError('Plate number is required.');
      return;
    }
    const branchId = isSuperAdmin ? form.branch : user?.branchId;
    if (!branchId) {
      setError('Branch is required.');
      return;
    }
    setSaving(true);
    try {
      const created = await ronda.vehicles.create({
        branch: Number(branchId),
        plate_number: form.plate_number.trim(),
        name: form.name.trim() || undefined,
      });
      setVehicles((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, plate_number: '', name: '' }));
    } catch (e) {
      const msg =
        e?.response?.data && typeof e.response.data === 'object'
          ? JSON.stringify(e.response.data)
          : e.message || 'Failed to create vehicle';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="vehicles-loading">Loading vehicles…</div>;

  return (
    <div className="vehicles-page">
      <h2>Vehicles</h2>
      <p className="vehicles-desc">
        Register patrol vehicles to a branch. Drivers choose a vehicle when starting a session.
      </p>

      <div className="vehicles-layout">
        <div className="vehicles-list">
          <table>
            <thead>
              <tr>
                <th>Plate number</th>
                <th>Name</th>
                <th>Branch</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td>{v.plate_number}</td>
                  <td>{v.name || '—'}</td>
                  <td>{v.branch_name || v.branch}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="vehicles-form-card">
          <h3>Register vehicle</h3>
          <form onSubmit={handleSubmit} className="vehicles-form">
            {isSuperAdmin && (
              <label>
                Branch
                <select name="branch" value={form.branch} onChange={handleChange} required>
                  <option value="">— Select branch —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Plate number
              <input
                type="text"
                name="plate_number"
                value={form.plate_number}
                onChange={handleChange}
                required
                placeholder="e.g. PNP-B001-01"
              />
            </label>
            <label>
              Name (optional)
              <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Patrol Vehicle 1" />
            </label>
            {error && <p className="vehicles-error-inline">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Register vehicle'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
