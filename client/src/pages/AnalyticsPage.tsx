import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  DollarSign, AlertTriangle, Clock, TrendingUp,
  Package, CheckCircle, FileText,
} from 'lucide-react';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/format';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorAlert from '../components/ErrorAlert';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Summary {
  totalInvoices: number;
  totalSpend: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  avgDaysToPayment: number | null;
  byStatus: { status: string; count: number; amount: number }[];
}

interface MonthlyRow {
  month: string;
  count: number;
  total: number;
  paid: number;
  outstanding: number;
}

interface AgingRow {
  bucket: string;
  label: string;
  count: number;
  amount: number;
}

interface VendorRow {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  totalSpend: number;
  totalPaid: number;
  outstanding: number;
}

interface TagRow {
  tag: string;
  invoiceCount: number;
  totalSpend: number;
}

interface OverdueRow {
  id: string;
  invoiceNumber: string;
  dueDate: string;
  total: number;
  balance: number;
  daysOverdue: number;
  customerName: string;
  customerId: string;
}

// ── Colours ───────────────────────────────────────────────────────────────────
const STATUS_PIE_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  sent: '#3b82f6',
  paid: '#22c55e',
  overdue: '#ef4444',
  void: '#f59e0b',
};

const AGING_COLORS = ['#22c55e', '#facc15', '#f97316', '#ef4444', '#7f1d1d'];
const TAG_COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f97316','#14b8a6','#84cc16','#f59e0b','#06b6d4'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function shortMonth(ym: string) {
  const [y, m] = ym.split('-');
  const d = new Date(+y, +m - 1, 1);
  return d.toLocaleString('default', { month: 'short' });
}

function currencyTick(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}

const CurrencyTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-medium">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [aging, setAging] = useState<AgingRow[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [overdue, setOverdue] = useState<OverdueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<Summary>('/analytics/summary'),
      api.get<MonthlyRow[]>('/analytics/monthly'),
      api.get<AgingRow[]>('/analytics/aging'),
      api.get<VendorRow[]>('/analytics/top-vendors?limit=10'),
      api.get<TagRow[]>('/analytics/by-tag'),
      api.get<OverdueRow[]>('/analytics/overdue'),
    ])
      .then(([s, m, a, v, t, o]) => {
        setSummary(s);
        setMonthly(m);
        setAging(a);
        setVendors(v);
        setTags(t);
        setOverdue(o);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner message="Loading analytics..." />;
  if (error) return <div className="p-6"><ErrorAlert message={error} /></div>;
  if (!summary) return null;

  // Pie data for status breakdown
  const pieData = summary.byStatus.map(r => ({
    name: r.status.charAt(0).toUpperCase() + r.status.slice(1),
    value: r.amount,
    status: r.status,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Incoming inventory invoice overview</p>
      </div>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Package className="w-5 h-5 text-blue-500" />}
          label="Total Invoices"
          value={String(summary.totalInvoices)}
          bg="bg-blue-50"
        />
        <KpiCard
          icon={<DollarSign className="w-5 h-5 text-violet-500" />}
          label="Total Spend"
          value={formatCurrency(summary.totalSpend)}
          bg="bg-violet-50"
        />
        <KpiCard
          icon={<CheckCircle className="w-5 h-5 text-green-500" />}
          label="Total Paid"
          value={formatCurrency(summary.totalPaid)}
          bg="bg-green-50"
        />
        <KpiCard
          icon={<TrendingUp className="w-5 h-5 text-orange-500" />}
          label="Outstanding"
          value={formatCurrency(summary.totalOutstanding)}
          bg="bg-orange-50"
          sub={summary.overdueCount > 0
            ? <span className="text-red-500">{summary.overdueCount} overdue</span>
            : undefined}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
          label="Overdue Amount"
          value={formatCurrency(summary.overdueAmount)}
          bg="bg-red-50"
        />
        <KpiCard
          icon={<Clock className="w-5 h-5 text-sky-500" />}
          label="Avg Days to Pay"
          value={summary.avgDaysToPayment != null ? `${summary.avgDaysToPayment} days` : '—'}
          bg="bg-sky-50"
        />
        <KpiCard
          icon={<FileText className="w-5 h-5 text-emerald-500" />}
          label="Pay Rate"
          value={summary.totalSpend > 0
            ? `${Math.round((summary.totalPaid / summary.totalSpend) * 100)}%`
            : '—'}
          bg="bg-emerald-50"
        />
        <KpiCard
          icon={<DollarSign className="w-5 h-5 text-amber-500" />}
          label="Avg Invoice Size"
          value={summary.totalInvoices > 0
            ? formatCurrency(summary.totalSpend / summary.totalInvoices)
            : '—'}
          bg="bg-amber-50"
        />
      </div>

      {/* ── Monthly spend trend ─────────────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-700 mb-4">Monthly Spend — Last 13 Months</h2>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={monthly} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradPaid" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tickFormatter={shortMonth} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={currencyTick} tick={{ fontSize: 11 }} width={56} />
            <Tooltip content={<CurrencyTooltip />} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="total" name="Invoiced"
              stroke="#3b82f6" fill="url(#gradTotal)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="paid" name="Paid"
              stroke="#22c55e" fill="url(#gradPaid)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Aging + status pie ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Aging buckets */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Invoice Aging (Unpaid)</h2>
          {aging.every(a => a.amount === 0) ? (
            <p className="text-sm text-gray-400 py-8 text-center">No outstanding invoices.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={aging} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={currencyTick} tick={{ fontSize: 11 }} width={56} />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  labelFormatter={(l) => `Bucket: ${l}`}
                />
                <Bar dataKey="amount" name="Outstanding" radius={[4, 4, 0, 0]}>
                  {aging.map((_, i) => (
                    <Cell key={i} fill={AGING_COLORS[i] ?? '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status pie */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Spend by Status</h2>
          {pieData.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No data.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) =>
                    percent > 0.04 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                  }
                  labelLine={false}
                >
                  {pieData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={STATUS_PIE_COLORS[entry.status] ?? '#9ca3af'}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Top vendors + tag spend ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top vendors */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Top Vendors by Spend</h2>
          {vendors.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No vendors yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, vendors.length * 36)}>
              <BarChart
                layout="vertical"
                data={vendors.slice(0, 8)}
                margin={{ top: 0, right: 16, bottom: 0, left: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tickFormatter={currencyTick} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="customerName"
                  width={120}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 15) + '…' : v}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [formatCurrency(v), name]}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="totalSpend" name="Total Invoiced" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                <Bar dataKey="totalPaid" name="Paid" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Spend by tag */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Spend by Tag / Category</h2>
          {tags.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No tags found. Add tags to invoices to see breakdowns.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, Math.min(tags.length, 8) * 36)}>
              <BarChart
                layout="vertical"
                data={tags.slice(0, 8)}
                margin={{ top: 0, right: 16, bottom: 0, left: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tickFormatter={currencyTick} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="tag"
                  width={90}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="totalSpend" name="Spend" radius={[0, 4, 4, 0]}>
                  {tags.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={TAG_COLORS[i % TAG_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Overdue invoices table ──────────────────────────────────────────── */}
      {overdue.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Overdue Invoices ({overdue.length})
            </h2>
            <Link to="/invoices?status=overdue" className="text-sm text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Invoice #</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Vendor</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Due Date</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Days Over</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {overdue.map((row) => (
                  <tr key={row.id} className="hover:bg-red-50/40 transition-colors">
                    <td className="px-4 py-2">
                      <Link
                        to={`/invoices/${row.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {row.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-700 max-w-[160px] truncate">
                      {row.customerName}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{formatDate(row.dueDate)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-medium ${
                        row.daysOverdue > 60 ? 'text-red-600' :
                        row.daysOverdue > 30 ? 'text-orange-500' : 'text-yellow-600'
                      }`}>
                        {row.daysOverdue}d
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-red-600 tabular-nums">
                      {formatCurrency(row.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, bg, sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bg: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className={`card p-4 ${bg}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">{label}</p>
          <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
          {sub && <p className="text-xs mt-0.5">{sub}</p>}
        </div>
        <div className="ml-2 mt-0.5 flex-shrink-0">{icon}</div>
      </div>
    </div>
  );
}
