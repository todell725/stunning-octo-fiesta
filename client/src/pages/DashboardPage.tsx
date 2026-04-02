import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, DollarSign, Clock, CheckCircle, AlertTriangle, Plus } from 'lucide-react';
import api from '../utils/api';
import { Invoice, InvoiceListItem } from '../types';
import { formatCurrency, formatDate, STATUS_COLORS, STATUS_LABELS } from '../utils/format';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';

interface DashboardStats {
  total: number;
  draft: number;
  sent: number;
  paid: number;
  overdue: number;
  totalRevenue: number;
  totalPaid: number;
  totalOutstanding: number;
}

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api.get<{ invoices: InvoiceListItem[]; total: number }>('/invoices?pageSize=100')
      .then(({ invoices }) => {
        setInvoices(invoices);
        const s: DashboardStats = {
          total: invoices.length,
          draft: invoices.filter((i) => i.status === 'draft').length,
          sent: invoices.filter((i) => i.status === 'sent').length,
          paid: invoices.filter((i) => i.status === 'paid').length,
          overdue: invoices.filter((i) => i.status === 'overdue').length,
          totalRevenue: invoices.reduce((a, i) => a + i.total, 0),
          totalPaid: invoices.reduce((a, i) => a + i.amountPaid, 0),
          totalOutstanding: invoices
            .filter((i) => i.status !== 'paid' && i.status !== 'void')
            .reduce((a, i) => a + (i.total - i.amountPaid), 0),
        };
        setStats(s);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const recent = invoices.slice(0, 8);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of your invoices</p>
        </div>
        <Link to="/invoices/new" className="btn-primary">
          <Plus className="w-4 h-4" />
          New Invoice
        </Link>
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<FileText className="w-5 h-5 text-blue-500" />}
            label="Total Invoices"
            value={String(stats.total)}
            bg="bg-blue-50"
          />
          <StatCard
            icon={<DollarSign className="w-5 h-5 text-green-500" />}
            label="Total Revenue"
            value={formatCurrency(stats.totalRevenue)}
            bg="bg-green-50"
          />
          <StatCard
            icon={<CheckCircle className="w-5 h-5 text-emerald-500" />}
            label="Collected"
            value={formatCurrency(stats.totalPaid)}
            bg="bg-emerald-50"
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5 text-orange-500" />}
            label="Outstanding"
            value={formatCurrency(stats.totalOutstanding)}
            bg="bg-orange-50"
          />
        </div>
      )}

      {/* Status breakdown */}
      {stats && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">By Status</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['draft', 'sent', 'paid', 'overdue'] as const).map((s) => (
              <Link
                key={s}
                to={`/invoices?status=${s}`}
                className="flex flex-col gap-1 rounded-lg border border-gray-100 hover:border-blue-200 p-3 transition-colors"
              >
                <span className={`status-badge self-start ${STATUS_COLORS[s]}`}>
                  {STATUS_LABELS[s]}
                </span>
                <span className="text-2xl font-bold text-gray-900">
                  {stats[s as keyof DashboardStats] as number}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent invoices */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Recent Invoices</h2>
          <Link to="/invoices" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        <div className="divide-y divide-gray-50">
          {recent.map((inv) => (
            <Link
              key={inv.id}
              to={`/invoices/${inv.id}`}
              className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm text-gray-900 truncate">{inv.invoiceNumber}</p>
                <p className="text-xs text-gray-500 truncate">{inv.customer.name}</p>
              </div>
              <div className="flex items-center gap-4 ml-4">
                <StatusBadge status={inv.status} />
                <span className="text-sm font-semibold text-gray-900 tabular-nums">
                  {formatCurrency(inv.total)}
                </span>
                <span className="text-xs text-gray-400 hidden sm:block">
                  {formatDate(inv.issueDate)}
                </span>
              </div>
            </Link>
          ))}
          {recent.length === 0 && (
            <p className="text-center py-8 text-sm text-gray-400">No invoices yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: string; bg: string }) {
  return (
    <div className={`card p-4 ${bg}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className="mt-1">{icon}</div>
      </div>
    </div>
  );
}
