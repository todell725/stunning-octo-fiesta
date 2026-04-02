import React, { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Filter } from 'lucide-react';
import api from '../utils/api';
import { InvoiceListItem, InvoiceStatus } from '../types';
import { formatCurrency, formatDate, STATUS_LABELS } from '../utils/format';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorAlert from '../components/ErrorAlert';

const PAGE_SIZE = 20;
const STATUSES: Array<InvoiceStatus | ''> = ['', 'draft', 'sent', 'paid', 'overdue', 'void'];

export default function InvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || '';
  const currentPage = parseInt(searchParams.get('page') || '1');

  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(PAGE_SIZE),
      });
      if (statusFilter) params.set('status', statusFilter);
      const data = await api.get<{ invoices: InvoiceListItem[]; total: number }>(
        `/invoices?${params}`
      );
      setInvoices(data.invoices);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, currentPage]);

  useEffect(() => { load(); }, [load]);

  function setStatus(s: string) {
    const p = new URLSearchParams(searchParams);
    if (s) p.set('status', s); else p.delete('status');
    p.set('page', '1');
    setSearchParams(p);
  }

  function setPage(p: number) {
    const sp = new URLSearchParams(searchParams);
    sp.set('page', String(p));
    setSearchParams(sp);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">{total} invoice{total !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/invoices/new" className="btn-primary">
          <Plus className="w-4 h-4" />
          New Invoice
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {STATUSES.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s ? STATUS_LABELS[s] : 'All'}
          </button>
        ))}
      </div>

      {error && <ErrorAlert message={error} />}

      <div className="card overflow-hidden">
        {loading ? (
          <LoadingSpinner />
        ) : invoices.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">No invoices found.</p>
            <Link to="/invoices/new" className="btn-primary mt-4 inline-flex">
              Create your first invoice
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Invoice #</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Customer</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Issue Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Due Date</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Total</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to={`/invoices/${inv.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                        {inv.customer.name}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(inv.issueDate)}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(inv.dueDate)}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatCurrency(inv.total)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span
                          className={
                            inv.total - inv.amountPaid > 0.01
                              ? 'text-red-600 font-medium'
                              : 'text-green-600'
                          }
                        >
                          {formatCurrency(inv.total - inv.amountPaid)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={currentPage}
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
