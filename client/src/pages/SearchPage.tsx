import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, Download, Filter, X } from 'lucide-react';
import api from '../utils/api';
import { SearchResult, InvoiceStatus } from '../types';
import { formatCurrency, formatDate, STATUS_LABELS } from '../utils/format';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import LoadingSpinner from '../components/LoadingSpinner';

const STATUSES: Array<InvoiceStatus | ''> = ['', 'draft', 'sent', 'paid', 'overdue', 'void'];

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [minTotal, setMinTotal] = useState('');
  const [maxTotal, setMaxTotal] = useState('');
  const [issueDateFrom, setIssueDateFrom] = useState('');
  const [issueDateTo, setIssueDateTo] = useState('');
  const [dueDateFrom, setDueDateFrom] = useState('');
  const [dueDateTo, setDueDateTo] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [sortBy, setSortBy] = useState('issueDate');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (status) params.set('status', status);
    if (minTotal) params.set('minTotal', minTotal);
    if (maxTotal) params.set('maxTotal', maxTotal);
    if (issueDateFrom) params.set('issueDateFrom', issueDateFrom);
    if (issueDateTo) params.set('issueDateTo', issueDateTo);
    if (dueDateFrom) params.set('dueDateFrom', dueDateFrom);
    if (dueDateTo) params.set('dueDateTo', dueDateTo);
    if (tagsInput) params.set('tags', tagsInput);
    params.set('sortBy', sortBy);
    params.set('sortDir', sortDir);
    params.set('page', String(p));
    params.set('pageSize', '20');
    return params;
  }, [query, status, minTotal, maxTotal, issueDateFrom, issueDateTo, dueDateFrom, dueDateTo, tagsInput, sortBy, sortDir]);

  async function handleSearch(e?: React.FormEvent, p = 1) {
    e?.preventDefault();
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const data = await api.get<SearchResult>(`/search?${buildParams(p)}`);
      setResult(data);
      setPage(p);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    const params = buildParams(1);
    params.set('pageSize', '10000');
    window.location.href = `/api/search/export?${params}`;
  }

  function clearFilters() {
    setStatus(''); setMinTotal(''); setMaxTotal('');
    setIssueDateFrom(''); setIssueDateTo('');
    setDueDateFrom(''); setDueDateTo('');
    setTagsInput('');
  }

  const hasFilters = status || minTotal || maxTotal || issueDateFrom || issueDateTo ||
    dueDateFrom || dueDateTo || tagsInput;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Search</h1>
        <p className="text-sm text-gray-500 mt-1">
          Full-text search across invoice numbers, customers, OCR text, notes, tags, and more.
        </p>
      </div>

      <form onSubmit={handleSearch} className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search invoices, customers, OCR text, notes, tags..."
              className="input pl-9 pr-3 py-2.5"
            />
          </div>
          <button type="submit" className="btn-primary px-5">Search</button>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-secondary ${hasFilters ? 'border-blue-400 text-blue-600' : ''}`}
          >
            <Filter className="w-4 h-4" />
            Filters {hasFilters && <span className="ml-1 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5">•</span>}
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="card p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
            <div>
              <label className="label text-xs">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="input text-sm">
                <option value="">Any</option>
                {STATUSES.filter(Boolean).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s!]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-xs">Min Total ($)</label>
              <input type="number" value={minTotal} onChange={(e) => setMinTotal(e.target.value)} placeholder="0" className="input text-sm" />
            </div>
            <div>
              <label className="label text-xs">Max Total ($)</label>
              <input type="number" value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} placeholder="Any" className="input text-sm" />
            </div>
            <div>
              <label className="label text-xs">Tags</label>
              <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="web,design" className="input text-sm" />
            </div>
            <div>
              <label className="label text-xs">Issue Date From</label>
              <input type="date" value={issueDateFrom} onChange={(e) => setIssueDateFrom(e.target.value)} className="input text-sm" />
            </div>
            <div>
              <label className="label text-xs">Issue Date To</label>
              <input type="date" value={issueDateTo} onChange={(e) => setIssueDateTo(e.target.value)} className="input text-sm" />
            </div>
            <div>
              <label className="label text-xs">Due Date From</label>
              <input type="date" value={dueDateFrom} onChange={(e) => setDueDateFrom(e.target.value)} className="input text-sm" />
            </div>
            <div>
              <label className="label text-xs">Due Date To</label>
              <input type="date" value={dueDateTo} onChange={(e) => setDueDateTo(e.target.value)} className="input text-sm" />
            </div>
            <div>
              <label className="label text-xs">Sort By</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="input text-sm">
                <option value="issueDate">Issue Date</option>
                <option value="dueDate">Due Date</option>
                <option value="total">Total</option>
                <option value="invoiceNumber">Invoice #</option>
                <option value="customerName">Customer</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Sort Direction</label>
              <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} className="input text-sm">
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </div>
            {hasFilters && (
              <div className="flex items-end">
                <button type="button" onClick={clearFilters} className="btn-secondary btn-sm w-full justify-center">
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              </div>
            )}
          </div>
        )}
      </form>

      {/* Results */}
      {loading && <LoadingSpinner message="Searching..." />}

      {!loading && result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {result.total} result{result.total !== 1 ? 's' : ''}
              {query && <span className="ml-1">for "<strong>{query}</strong>"</span>}
            </p>
            {result.total > 0 && (
              <button onClick={handleExport} className="btn-secondary btn-sm">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            )}
          </div>

          {result.invoices.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">
              <Search className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No invoices match your search.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Invoice #</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Customer</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Tags</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Total</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result.invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link to={`/invoices/${inv.id}`} className="font-medium text-blue-600 hover:underline">
                            {inv.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">
                          {inv.customerName}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(inv.issueDate)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {inv.tags.map((t) => (
                              <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{t}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {formatCurrency(inv.total)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className={inv.total - inv.amountPaid > 0.01 ? 'text-red-600' : 'text-green-600'}>
                            {formatCurrency(inv.total - inv.amountPaid)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={result.page}
                pages={result.pages}
                total={result.total}
                pageSize={result.pageSize}
                onPageChange={(p) => handleSearch(undefined, p)}
              />
            </div>
          )}
        </div>
      )}

      {!loading && !searched && (
        <div className="text-center py-16 text-gray-400">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Enter a search query or apply filters to find invoices.</p>
          <p className="text-xs mt-1">Searches across invoice numbers, customers, OCR text, notes, and tags.</p>
        </div>
      )}
    </div>
  );
}
