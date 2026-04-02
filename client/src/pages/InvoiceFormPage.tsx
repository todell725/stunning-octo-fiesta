import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, CheckCircle } from 'lucide-react';
import api from '../utils/api';
import { Invoice, Customer, ParsedInvoiceData } from '../types';
import { formatDateInput, formatCurrency } from '../utils/format';
import ErrorAlert from '../components/ErrorAlert';
import LoadingSpinner from '../components/LoadingSpinner';

interface LineItemForm {
  description: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_LINE: LineItemForm = { description: '', quantity: '1', unitPrice: '' };

export default function InvoiceFormPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState<string>('draft');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(formatDateInput(new Date().toISOString()));
  const [dueDate, setDueDate] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ ...EMPTY_LINE }]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Prefill from OCR if present in sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem('ocr_prefill');
    if (raw) {
      sessionStorage.removeItem('ocr_prefill');
      try {
        const parsed: ParsedInvoiceData = JSON.parse(raw);
        if (parsed.invoiceNumber) setInvoiceNumber(parsed.invoiceNumber);
        if (parsed.issueDate) setIssueDate(parsed.issueDate);
        if (parsed.dueDate) setDueDate(parsed.dueDate);
        if (parsed.poNumber) setPoNumber(parsed.poNumber);
        if (parsed.taxRate) setTaxRate(String(parsed.taxRate));
        if (parsed.lineItems && parsed.lineItems.length > 0) {
          setLineItems(
            parsed.lineItems.map((li) => ({
              description: li.description,
              quantity: String(li.quantity),
              unitPrice: String(li.unitPrice),
            }))
          );
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers?pageSize=200').then((d) =>
      setCustomers(d.customers)
    );
  }, []);

  useEffect(() => {
    if (!isEdit || !id) return;
    api.get<Invoice>(`/invoices/${id}`).then((inv) => {
      setCustomerId(inv.customerId);
      setStatus(inv.status);
      setInvoiceNumber(inv.invoiceNumber);
      setIssueDate(formatDateInput(inv.issueDate));
      setDueDate(formatDateInput(inv.dueDate));
      setPoNumber(inv.poNumber || '');
      setTaxRate(String(inv.taxRate));
      setNotes(inv.notes || '');
      setTagsInput(inv.tags.map((t) => t.tag).join(', '));
      setLineItems(
        inv.lineItems.length > 0
          ? inv.lineItems.map((li) => ({
              description: li.description,
              quantity: String(li.quantity),
              unitPrice: String(li.unitPrice),
            }))
          : [{ ...EMPTY_LINE }]
      );
      setLoading(false);
    });
  }, [id, isEdit]);

  const subtotal = lineItems.reduce((sum, li) => {
    const qty = parseFloat(li.quantity) || 0;
    const price = parseFloat(li.unitPrice) || 0;
    return sum + qty * price;
  }, 0);
  const tax = (parseFloat(taxRate) || 0) / 100;
  const taxAmt = subtotal * tax;
  const total = subtotal + taxAmt;

  function updateLine(idx: number, field: keyof LineItemForm, value: string) {
    const next = [...lineItems];
    next[idx] = { ...next[idx], [field]: value };
    setLineItems(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!customerId) { setError('Please select a customer'); return; }
    const validLines = lineItems.filter((li) => li.description && li.unitPrice);
    if (validLines.length === 0) { setError('Add at least one line item'); return; }

    setSaving(true);
    try {
      const payload = {
        customerId,
        status,
        invoiceNumber: invoiceNumber || undefined,
        issueDate: issueDate || undefined,
        dueDate: dueDate || null,
        poNumber: poNumber || null,
        taxRate: parseFloat(taxRate) || 0,
        notes: notes || null,
        tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
        lineItems: validLines.map((li) => ({
          description: li.description,
          quantity: parseFloat(li.quantity) || 1,
          unitPrice: parseFloat(li.unitPrice) || 0,
        })),
      };

      if (isEdit && id) {
        await api.put(`/invoices/${id}`, payload);
        navigate(`/invoices/${id}`);
      } else {
        const inv = await api.post<Invoice>('/invoices', payload);
        navigate(`/invoices/${inv.id}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          to={isEdit ? `/invoices/${id}` : '/invoices'}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {isEdit ? 'Back to Invoice' : 'Back to Invoices'}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'Edit Invoice' : 'New Invoice'}
        </h1>
      </div>

      {error && <ErrorAlert message={error} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Customer *</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="input"
              required
            >
              <option value="">Select customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
              {['draft', 'sent', 'paid', 'overdue', 'void'].map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Invoice # (auto-generated if blank)</label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="INV-2024-0001"
              className="input"
            />
          </div>
          <div>
            <label className="label">PO Number</label>
            <input
              type="text"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Issue Date</label>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Tax Rate (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Tags (comma-separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="web, design, retainer"
              className="input"
            />
          </div>
        </div>

        {/* Line items */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-700 text-sm">Line Items</h2>
            <button
              type="button"
              onClick={() => setLineItems([...lineItems, { ...EMPTY_LINE }])}
              className="btn-secondary btn-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Add Line
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Description</th>
                  <th className="text-right px-4 py-2 font-medium w-24">Qty</th>
                  <th className="text-right px-4 py-2 font-medium w-32">Unit Price</th>
                  <th className="text-right px-4 py-2 font-medium w-28">Total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lineItems.map((li, idx) => {
                  const qty = parseFloat(li.quantity) || 0;
                  const price = parseFloat(li.unitPrice) || 0;
                  return (
                    <tr key={idx}>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={li.description}
                          onChange={(e) => updateLine(idx, 'description', e.target.value)}
                          placeholder="Service or product description"
                          className="input"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={li.quantity}
                          onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                          className="input text-right"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={li.unitPrice}
                          onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                          placeholder="0.00"
                          className="input text-right"
                        />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">
                        {formatCurrency(qty * price)}
                      </td>
                      <td className="px-2 py-2">
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200 text-sm">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right text-gray-500">Subtotal</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(subtotal)}</td>
                  <td />
                </tr>
                {parseFloat(taxRate) > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right text-gray-500">
                      Tax ({taxRate}%)
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(taxAmt)}</td>
                    <td />
                  </tr>
                )}
                <tr className="font-bold text-base">
                  <td colSpan={3} className="px-4 py-3 text-right">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Notes */}
        <div className="card p-5">
          <label className="label">Notes (visible on invoice)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Payment terms, instructions, thank you message..."
            className="input resize-none"
          />
        </div>

        <div className="flex justify-end gap-3">
          <Link
            to={isEdit ? `/invoices/${id}` : '/invoices'}
            className="btn-secondary"
          >
            Cancel
          </Link>
          <button type="submit" disabled={saving} className="btn-primary">
            <CheckCircle className="w-4 h-4" />
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}
