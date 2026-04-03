import React, { useState, useEffect, FormEvent } from 'react';
import { KeyRound, ShieldCheck, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  role: string;
  locationLabel: string | null;
}

// ── Small reusable alert ───────────────────────────────────────────────────
function Alert({ type, msg }: { type: 'success' | 'error'; msg: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
      type === 'success'
        ? 'bg-green-50 text-green-700 border border-green-200'
        : 'bg-red-50 text-red-700 border border-red-200'
    }`}>
      {type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      {msg}
    </div>
  );
}

// ── Change own password ────────────────────────────────────────────────────
function ChangePasswordPanel() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (next !== confirm) {
      setStatus({ type: 'error', msg: 'New passwords do not match' });
      return;
    }
    if (next.length < 6) {
      setStatus({ type: 'error', msg: 'Password must be at least 6 characters' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      setStatus({ type: 'success', msg: 'Password updated successfully' });
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'Failed to update password' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound className="w-5 h-5 text-blue-500" />
        <h2 className="text-base font-semibold text-gray-900">Change Your Password</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 max-w-sm">
        {status && <Alert type={status.type} msg={status.msg} />}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
          <input
            type="password"
            value={current}
            onChange={e => setCurrent(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <input
            type="password"
            value={next}
            onChange={e => setNext(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
        >
          {loading ? 'Saving…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}

// ── Admin: reset any user's password ──────────────────────────────────────
function AdminResetPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const { user: me } = useAuth();

  useEffect(() => {
    api.get<UserRow[]>('/auth/admin/users').then(setUsers).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (!selectedUsername) {
      setStatus({ type: 'error', msg: 'Select a user' });
      return;
    }
    if (newPassword !== confirm) {
      setStatus({ type: 'error', msg: 'Passwords do not match' });
      return;
    }
    if (newPassword.length < 6) {
      setStatus({ type: 'error', msg: 'Password must be at least 6 characters' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/admin/reset-password', { username: selectedUsername, newPassword });
      const target = users.find(u => u.username === selectedUsername);
      setStatus({ type: 'success', msg: `Password reset for ${target?.displayName ?? selectedUsername}` });
      setSelectedUsername(''); setNewPassword(''); setConfirm('');
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'Reset failed' });
    } finally {
      setLoading(false);
    }
  }

  // Filter out the current user — can't reset your own via this panel
  const otherUsers = users.filter(u => u.username !== me?.username);

  const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin', staff: 'Staff' };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-purple-500" />
        <h2 className="text-base font-semibold text-gray-900">Reset a User's Password</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">Use this to unlock an account or set a temporary password.</p>

      <form onSubmit={handleSubmit} className="space-y-3 max-w-sm">
        {status && <Alert type={status.type} msg={status.msg} />}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
          <select
            value={selectedUsername}
            onChange={e => setSelectedUsername(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">— Select user —</option>
            {otherUsers.map(u => (
              <option key={u.id} value={u.username}>
                {u.displayName} ({ROLE_LABELS[u.role] ?? u.role}
                {u.locationLabel ? ` · ${u.locationLabel}` : ''})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
        >
          {loading ? 'Resetting…' : 'Reset Password'}
        </button>
      </form>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>
      <ChangePasswordPanel />
      {isAdmin && <AdminResetPanel />}
    </div>
  );
}
