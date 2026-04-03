import React, { useState, useEffect, FormEvent } from 'react';
import { Plus, Pencil, Trash2, Tag, Check, X } from 'lucide-react';
import api from '../utils/api';

interface Category {
  id: string;
  name: string;
  color: string;
  _count: { invoices: number };
}

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#64748b', '#78716c',
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
          style={{ backgroundColor: c, borderColor: value === c ? '#1e293b' : 'transparent' }}
        />
      ))}
    </div>
  );
}

function CategoryRow({ cat, onSaved, onDeleted }: {
  cat: Category;
  onSaved: (updated: Category) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [color, setColor] = useState(cat.color);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await api.put<Category>(`/categories/${cat.id}`, { name, color });
      onSaved(updated);
      setEditing(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${cat.name}"? Invoices in this category will be uncategorised.`)) return;
    try {
      await api.del(`/categories/${cat.id}`);
      onDeleted(cat.id);
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (editing) {
    return (
      <li className="p-4 rounded-xl border border-blue-200 bg-blue-50 space-y-3">
        <div className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <ColorPicker value={color} onChange={setColor} />
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="flex items-center gap-1 bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button onClick={() => { setEditing(false); setName(cat.name); setColor(cat.color); }} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50">
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors">
      <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
      <span className="flex-1 font-medium text-gray-800 text-sm">{cat.name}</span>
      <span className="text-xs text-gray-400">{cat._count.invoices} invoice{cat._count.invoices !== 1 ? 's' : ''}</span>
      <button onClick={() => setEditing(true)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button onClick={handleDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Category[]>('/categories').then(setCategories).finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await api.post<Category>('/categories', { name: newName.trim(), color: newColor });
      setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      setAdding(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-indigo-500" />
          <h1 className="text-xl font-bold text-gray-900">Categories</h1>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Category
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="p-4 rounded-xl border border-indigo-200 bg-indigo-50 space-y-3">
          <label className="block text-sm font-medium text-gray-700">Category name</label>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Utilities, Subscriptions, Insurance…"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <label className="block text-sm font-medium text-gray-700">Colour</label>
          <ColorPicker value={newColor} onChange={setNewColor} />
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="flex items-center gap-1 bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No categories yet. Add one to start organising your bills.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {categories.map(cat => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              onSaved={updated => setCategories(prev => prev.map(c => c.id === updated.id ? { ...updated, _count: c._count } : c))}
              onDeleted={id => setCategories(prev => prev.filter(c => c.id !== id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
