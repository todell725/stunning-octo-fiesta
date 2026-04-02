import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import api from '../utils/api';
import { Customer } from '../types';
import { formatCurrency, formatDate } from '../utils/format';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer & { invoices?: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Customer & { invoices: any[] }>(`/customers/${id}`)
      .then(setCustomer)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (!customer) return <div className="p-6 text-gray-500">Customer not found.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Link to="/customers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Back to Customers
        </Link>
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
          <Link
            to={`/invoices/new?customerId=${customer.id}`}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> New Invoice
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm">Contact Info</h2>
          {customer.email && <Row label="Email" value={customer.email} />}
          {customer.phone && <Row label="Phone" value={customer.phone} />}
          {customer.address && <Row label="Address" value={customer.address} />}
          {(customer.city || customer.state) && (
            <Row label="City/State" value={[customer.city, customer.state, customer.zip].filter(Boolean).join(', ')} />
          )}
          {customer.country && <Row label="Country" value={customer.country} />}
          {customer.notes && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-600">{customer.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Invoices */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 text-sm">Recent Invoices</h2>
        </div>
        {!customer.invoices || customer.invoices.length === 0 ? (
          <p className="text-center py-8 text-sm text-gray-400">No invoices yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Invoice #</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customer.invoices.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link to={`/invoices/${inv.id}`} className="text-blue-600 hover:underline font-medium">
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-2 text-gray-500">{formatDate(inv.issueDate)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(inv.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-gray-800 text-right">{value}</span>
    </div>
  );
}
