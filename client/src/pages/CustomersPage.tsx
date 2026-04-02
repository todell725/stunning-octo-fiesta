import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Users } from 'lucide-react';
import api from '../utils/api';
import { Customer } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorAlert from '../components/ErrorAlert';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 20;

interface CustomerFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  notes: string;
}

const EMPTY_FORM: CustomerFormData = {
  name: '', email: '', phone: '', address: '',
  city: '', state: '', zip: '', country: 'US', notes: '',
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<CustomerFormData>({ ...EMPTY_FORM });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set('q', search);
      const data = await api.get<{ customers: Customer[]; total: number }>(
        `/customers?${params}`
      );
      setCustomers(data.customers);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditId(null);
    setFormData({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEdit(c: Customer) {
    setEditId(c.id);
    setFormData({
      name: c.name, email: c.email || '', phone: c.phone || '',
      address: c.address || '', city: c.city || '', state: c.state || '',
      zip: c.zip || '', country: c.country || 'US', notes: c.notes || '',
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = Object.fromEntries(
        Object.entries(formData).map(([k, v]) => [k, v || null])
      );
      (data as any).name = formData.name; // always string
      if (editId) {
        await api.put(`/customers/${editId}`, data);
      } else {
        await api.post('/customers', data);
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this customer?')) return;
    await api.del(`/customers/${id}`);
    load();
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-1">{total} customer{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, email, phone..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="input pl-9"
        />
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Customer form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                {editId ? 'Edit Customer' : 'New Customer'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
              <div>
                <label className="label">Name *</label>
                <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Email</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="input" />
                </div>
              </div>
              <div>
                <label className="label">Address</label>
                <input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="input" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">City</label>
                  <input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">State</label>
                  <input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">ZIP</label>
                  <input value={formData.zip} onChange={(e) => setFormData({ ...formData, zip: e.target.value })} className="input" />
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} className="input resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editId ? 'Save Changes' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <LoadingSpinner />
        ) : customers.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No customers found.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Phone</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">City</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Invoices</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link to={`/customers/${c.id}`} className="font-medium text-blue-600 hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{c.email || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{c.phone || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{c.city || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{c._count?.invoices ?? 0}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(c)} className="btn-secondary btn-sm mr-1">Edit</button>
                        <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-600 btn-sm">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pages={Math.ceil(total / PAGE_SIZE)}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
