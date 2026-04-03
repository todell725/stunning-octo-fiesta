import React, { useEffect, useState, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit, Trash2, Plus, Paperclip, MessageSquare,
  Download, CreditCard, Camera
} from 'lucide-react';
import api from '../utils/api';
import { runOcr, isOcrTarget } from '../utils/ocr';
import { Invoice, Payment } from '../types';
import { formatCurrency, formatDate, fileSize } from '../utils/format';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorAlert from '../components/ErrorAlert';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('check');
  const [addingPayment, setAddingPayment] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ocrProcessing, setOcrProcessing] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.get<Invoice>(`/invoices/${id}`);
      setInvoice(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleDelete() {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    await api.del(`/invoices/${id}`);
    navigate('/invoices');
  }

  async function handleStatusChange(status: string) {
    await api.put(`/invoices/${id}`, { status });
    load();
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentAmount) return;
    setAddingPayment(true);
    try {
      await api.post(`/invoices/${id}/payments`, {
        amount: parseFloat(paymentAmount),
        method: paymentMethod,
      });
      setPaymentAmount('');
      load();
    } finally {
      setAddingPayment(false);
    }
  }

  async function handleDeletePayment(paymentId: string) {
    await api.del(`/invoices/${id}/payments/${paymentId}`);
    load();
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setAddingNote(true);
    try {
      await api.post(`/invoices/${id}/notes`, { content: noteContent });
      setNoteContent('');
      load();
    } finally {
      setAddingNote(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const attachment = await api.upload<{ id: string }>(`/invoices/${id}/attachments`, fd);
      load();

      if (isOcrTarget(file.type)) {
        setOcrProcessing(attachment.id);
        try {
          const ocrText = await runOcr(file);
          if (ocrText.trim()) {
            await api.patch(`/invoices/${id}/attachments/${attachment.id}`, { ocrText });
            load();
          }
        } catch (ocrErr) {
          console.warn('Puter OCR failed:', ocrErr);
        } finally {
          setOcrProcessing(null);
        }
      }
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    }
    e.target.value = '';
  }

  async function handleDeleteAttachment(attId: string) {
    await api.del(`/invoices/${id}/attachments/${attId}`);
    load();
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6"><ErrorAlert message={error} /></div>;
  if (!invoice) return null;

  const balance = invoice.total - invoice.amountPaid;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/invoices" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft className="w-4 h-4" /> Back to Invoices
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{invoice.invoiceNumber}</h1>
          <div className="flex items-center gap-3 mt-1">
            <StatusBadge status={invoice.status} />
            {invoice.tags.length > 0 && (
              <div className="flex gap-1">
                {invoice.tags.map((t) => (
                  <span key={t.id} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                    {t.tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/invoices/${id}/edit`} className="btn-secondary">
            <Edit className="w-4 h-4" /> Edit
          </Link>
          <button onClick={handleDelete} className="btn-danger">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Bill to + Invoice info */}
          <div className="card p-5 grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Bill To</p>
              <Link to={`/customers/${invoice.customerId}`} className="font-semibold text-blue-600 hover:underline">
                {invoice.customer.name}
              </Link>
              {invoice.customer.email && <p className="text-sm text-gray-500">{invoice.customer.email}</p>}
              {invoice.customer.phone && <p className="text-sm text-gray-500">{invoice.customer.phone}</p>}
              {invoice.customer.address && <p className="text-sm text-gray-500">{invoice.customer.address}</p>}
            </div>
            <div className="space-y-2">
              <InfoRow label="Issue Date" value={formatDate(invoice.issueDate)} />
              <InfoRow label="Due Date" value={formatDate(invoice.dueDate)} />
              {invoice.paidDate && <InfoRow label="Paid Date" value={formatDate(invoice.paidDate)} />}
              {invoice.poNumber && <InfoRow label="PO Number" value={invoice.poNumber} />}
            </div>
          </div>

          {/* Line items */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700 text-sm">Line Items</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Description</th>
                  <th className="text-right px-4 py-2 text-gray-600 font-medium">Qty</th>
                  <th className="text-right px-4 py-2 text-gray-600 font-medium">Unit Price</th>
                  <th className="text-right px-4 py-2 text-gray-600 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoice.lineItems.map((li) => (
                  <tr key={li.id}>
                    <td className="px-4 py-3">{li.description}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{li.quantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(li.unitPrice)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(li.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right text-gray-500">Subtotal</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(invoice.subtotal)}</td>
                </tr>
                {invoice.taxRate > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right text-gray-500">
                      Tax ({invoice.taxRate}%)
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(invoice.taxAmount)}</td>
                  </tr>
                )}
                <tr className="font-bold text-base">
                  <td colSpan={3} className="px-4 py-3 text-right">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(invoice.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="card p-5">
              <h2 className="font-semibold text-gray-700 text-sm mb-2">Notes</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {/* Attachments */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700 text-sm">Attachments</h2>
              <div className="flex gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                  capture="environment"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="btn-secondary btn-sm"
                >
                  <Paperclip className="w-3.5 h-3.5" /> Attach File
                </button>
                <Link to="/capture" className="btn-secondary btn-sm">
                  <Camera className="w-3.5 h-3.5" /> Camera
                </Link>
              </div>
            </div>
            {invoice.attachments.length === 0 ? (
              <p className="text-sm text-gray-400">No attachments.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {invoice.attachments.map((att) => (
                  <li key={att.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0 flex-1">
                      <a
                        href={`/uploads/${att.storedPath.split('/').pop()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline truncate block"
                      >
                        {att.originalName}
                      </a>
                      <p className="text-xs text-gray-400">
                        {fileSize(att.size)} · {formatDate(att.uploadedAt)}
                        {ocrProcessing === att.id && (
                          <span className="ml-2 text-blue-500 animate-pulse">⏳ Extracting text…</span>
                        )}
                        {!ocrProcessing && att.ocrExtractedText && (
                          <span className="ml-2 text-green-600">✓ Text extracted</span>
                        )}
                      </p>
                      {att.ocrExtractedText && (
                        <details className="mt-1">
                          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                            View OCR text
                          </summary>
                          <pre className="text-xs text-gray-500 mt-1 max-h-32 overflow-auto whitespace-pre-wrap bg-gray-50 p-2 rounded">
                            {att.ocrExtractedText}
                          </pre>
                        </details>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteAttachment(att.id)}
                      className="ml-3 text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Sidebar: payments, notes, status */}
        <div className="space-y-6">
          {/* Payment summary */}
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm">Payments</h2>
            <div className="space-y-1.5 text-sm">
              <InfoRow label="Total" value={formatCurrency(invoice.total)} bold />
              <InfoRow label="Paid" value={formatCurrency(invoice.amountPaid)} />
              <InfoRow
                label="Balance"
                value={formatCurrency(balance)}
                valueClass={balance > 0.01 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}
              />
            </div>

            {/* Record payment form */}
            {balance > 0.01 && (
              <form onSubmit={handleAddPayment} className="pt-3 border-t border-gray-100 space-y-2">
                <p className="text-xs font-medium text-gray-500">Record Payment</p>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="input text-sm"
                  required
                />
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="input text-sm"
                >
                  {['cash', 'check', 'card', 'wire', 'other'].map((m) => (
                    <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                  ))}
                </select>
                <button type="submit" disabled={addingPayment} className="btn-primary w-full justify-center">
                  <CreditCard className="w-4 h-4" /> Record Payment
                </button>
              </form>
            )}

            {/* Payment history */}
            {invoice.payments.length > 0 && (
              <ul className="divide-y divide-gray-50 pt-2">
                {invoice.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-medium">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-gray-400">{formatDate(p.paymentDate)} · {p.method}</p>
                    </div>
                    <button
                      onClick={() => handleDeletePayment(p.id)}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Change status */}
          <div className="card p-5 space-y-2">
            <h2 className="font-semibold text-gray-700 text-sm">Change Status</h2>
            <div className="grid grid-cols-2 gap-1.5">
              {(['draft', 'sent', 'paid', 'overdue', 'void'] as const).map((s) => (
                <button
                  key={s}
                  disabled={invoice.status === s}
                  onClick={() => handleStatusChange(s)}
                  className={`text-xs py-1.5 px-2 rounded border transition-colors ${
                    invoice.status === s
                      ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Internal notes */}
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm">Internal Notes</h2>
            <form onSubmit={handleAddNote} className="space-y-2">
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={3}
                placeholder="Add a note..."
                className="input resize-none text-sm"
              />
              <button type="submit" disabled={addingNote} className="btn-primary btn-sm">
                <Plus className="w-3.5 h-3.5" /> Add Note
              </button>
            </form>
            <ul className="space-y-2 pt-1">
              {invoice.invoiceNotes.map((n) => (
                <li key={n.id} className="text-sm bg-yellow-50 rounded p-3">
                  <p className="text-gray-700">{n.content}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label, value, bold, valueClass,
}: {
  label: string; value: string; bold?: boolean; valueClass?: string;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className={`${bold ? 'font-semibold' : ''} ${valueClass || ''} text-right`}>{value}</span>
    </div>
  );
}
