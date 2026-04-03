import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { stringify } from 'csv-stringify/sync';
import { searchInvoices, SearchOptions } from '../services/fts';

export default async function searchRoutes(app: FastifyInstance, opts: { authMiddleware: any[] }) {
  const { authMiddleware } = opts;

  app.get('/search', { preHandler: authMiddleware }, async (req: FastifyRequest) => {
    const q = req.query as Record<string, string>;
    const opts: SearchOptions = {
      query: q.q,
      status: q.status,
      customerId: q.customerId,
      minTotal: q.minTotal ? parseFloat(q.minTotal) : undefined,
      maxTotal: q.maxTotal ? parseFloat(q.maxTotal) : undefined,
      issueDateFrom: q.issueDateFrom,
      issueDateTo: q.issueDateTo,
      dueDateFrom: q.dueDateFrom,
      dueDateTo: q.dueDateTo,
      tags: q.tags ? q.tags.split(',').map(t => t.trim()) : undefined,
      sortBy: q.sortBy as SearchOptions['sortBy'],
      sortDir: q.sortDir as SearchOptions['sortDir'],
      page: q.page ? parseInt(q.page) : 1,
      pageSize: q.pageSize ? parseInt(q.pageSize) : 20,
    };
    return searchInvoices(opts);
  });

  app.get('/search/export', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>;
    const opts: SearchOptions = {
      query: q.q,
      status: q.status,
      customerId: q.customerId,
      minTotal: q.minTotal ? parseFloat(q.minTotal) : undefined,
      maxTotal: q.maxTotal ? parseFloat(q.maxTotal) : undefined,
      issueDateFrom: q.issueDateFrom,
      issueDateTo: q.issueDateTo,
      dueDateFrom: q.dueDateFrom,
      dueDateTo: q.dueDateTo,
      tags: q.tags ? q.tags.split(',').map(t => t.trim()) : undefined,
      sortBy: q.sortBy as SearchOptions['sortBy'],
      sortDir: q.sortDir as SearchOptions['sortDir'],
      page: 1,
      pageSize: 10000,
    };
    const result = await searchInvoices(opts);
    const rows = result.invoices.map(inv => ({
      invoice_number: inv.invoiceNumber,
      status: inv.status,
      customer_name: inv.customerName,
      customer_email: inv.customerEmail || '',
      issue_date: inv.issueDate ? new Date(inv.issueDate).toISOString().split('T')[0] : '',
      due_date: inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : '',
      paid_date: inv.paidDate ? new Date(inv.paidDate).toISOString().split('T')[0] : '',
      subtotal: inv.subtotal.toFixed(2),
      total: inv.total.toFixed(2),
      amount_paid: inv.amountPaid.toFixed(2),
      balance_due: (inv.total - inv.amountPaid).toFixed(2),
      po_number: inv.poNumber || '',
      tags: inv.tags.join(', '),
      notes: inv.notes || '',
    }));
    const csv = stringify(rows, { header: true });
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="invoices-export.csv"');
    return reply.send(csv);
  });
}
