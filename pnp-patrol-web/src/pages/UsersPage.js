import React, { useEffect, useState } from 'react';
import * as ronda from '../api/ronda';
import './UsersPage.css';

const ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'BRANCH_ADMIN', label: 'Branch Admin' },
  { value: 'DRIVER', label: 'Driver' },
];

export function UsersPage() {
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'DRIVER',
    branch: '',
  });

  useEffect(() => {
    async function load() {
      try {
        const [u, b] = await Promise.all([ronda.users.list(), ronda.branches.list()]);
        setUsers(u);
        setBranches(b);
      } catch (e) {
        setError(e.message || 'Failed to load users');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.username || !form.password || !form.role) {
      setError('Username, password, and role are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        username: form.username,
        email: form.email || undefined,
        password: form.password,
        role: form.role,
        branch: form.branch || null,
      };
      const created = await ronda.users.create(payload);
      setUsers((prev) => [...prev, created]);
      setForm((prev) => ({
        ...prev,
        username: '',
        email: '',
        password: '',
      }));
    } catch (e) {
      const msg =
        e?.response?.data && typeof e.response.data === 'object'
          ? JSON.stringify(e.response.data)
          : e.message || 'Failed to create user';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="users-loading">Loading users…</div>;
  if (error) return <div className="users-error">{error}</div>;

  return (
    <div className="users-page">
      <h2>User Management</h2>
      <p className="users-desc">
        Super Admin can manage all users. Branch Admin can manage drivers in their branch.
      </p>

      <div className="users-layout">
        <div className="users-list">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Branch</th>
                <th>Email</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.role}</td>
                  <td>{u.branch_name || '—'}</td>
                  <td>{u.email || '—'}</td>
                  <td>{u.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="users-form-card">
          <h3>Create user</h3>
          <form onSubmit={handleSubmit} className="users-form">
            <label>
              Username
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Role
              <select name="role" value={form.role} onChange={handleChange}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Branch
              <select name="branch" value={form.branch} onChange={handleChange}>
                <option value="">(None / Main)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </label>
            {error && <p className="users-error-inline">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Create user'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

