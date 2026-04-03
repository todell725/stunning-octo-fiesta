import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db';

export default async function analyticsRoutes(app: FastifyInstance, opts: { authMiddleware: any[] }) {
  const { authMiddleware } = opts;

  app.get('/analytics/summary', { preHandler: authMiddleware }, async () => {
    const [totalRow, byStatus, overdueRow, avgDaysRow] = await Promise.all([
      prisma.$queryRawUnsafe<{ count: number; total_spend: number; total_paid: number }[]>(`
        SELECT COUNT(*) as count, COALESCE(SUM(total),0) as total_spend, COALESCE(SUM("amountPaid"),0) as total_paid
        FROM invoices WHERE status != 'void'
      `),
      prisma.$queryRawUnsafe<{ status: string; count: number; amount: number }[]>(`
        SELECT status, COUNT(*) as count, COALESCE(SUM(total),0) as amount
        FROM invoices WHERE status != 'void' GROUP BY status
      `),
      prisma.$queryRawUnsafe<{ count: number; amount: number }[]>(`
        SELECT COUNT(*) as count, COALESCE(SUM(total - "amountPaid"),0) as amount
        FROM invoices WHERE status NOT IN ('paid','void') AND "dueDate" IS NOT NULL AND "dueDate" < datetime('now')
      `),
      prisma.$queryRawUnsafe<{ avg_days: number | null }[]>(`
        SELECT AVG(CAST((julianday("paidDate") - julianday("issueDate")) AS REAL)) as avg_days
        FROM invoices WHERE status = 'paid' AND "paidDate" IS NOT NULL
      `),
    ]);

    const s = totalRow[0] || { count: 0, total_spend: 0, total_paid: 0 };
    return {
      totalInvoices: Number(s.count),
      totalSpend: Number(s.total_spend),
      totalPaid: Number(s.total_paid),
      totalOutstanding: Number(s.total_spend) - Number(s.total_paid),
      overdueCount: Number(overdueRow[0]?.count || 0),
      overdueAmount: Number(overdueRow[0]?.amount || 0),
      avgDaysToPayment: avgDaysRow[0]?.avg_days != null ? Math.round(Number(avgDaysRow[0].avg_days)) : null,
      byStatus: byStatus.map(r => ({ status: r.status, count: Number(r.count), amount: Number(r.amount) })),
    };
  });

  app.get('/analytics/monthly', { preHandler: authMiddleware }, async () => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 12; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const rows = await prisma.$queryRawUnsafe<{ month: string; count: number; total: number; paid: number }[]>(`
      SELECT strftime('%Y-%m',"issueDate") as month, COUNT(*) as count,
             COALESCE(SUM(total),0) as total, COALESCE(SUM("amountPaid"),0) as paid
      FROM invoices WHERE status != 'void' AND "issueDate" >= date('now','-13 months')
      GROUP BY strftime('%Y-%m',"issueDate") ORDER BY month ASC
    `);
    const rowMap = new Map(rows.map(r => [r.month, r]));
    return months.map(month => {
      const r = rowMap.get(month);
      return { month, count: r ? Number(r.count) : 0, total: r ? Number(r.total) : 0, paid: r ? Number(r.paid) : 0, outstanding: r ? Number(r.total) - Number(r.paid) : 0 };
    });
  });

  app.get('/analytics/aging', { preHandler: authMiddleware }, async () => {
    const rows = await prisma.$queryRawUnsafe<{ bucket: string; count: number; amount: number }[]>(`
      SELECT
        CASE
          WHEN "dueDate" IS NULL OR julianday('now') - julianday("dueDate") <= 0 THEN 'current'
          WHEN julianday('now') - julianday("dueDate") <= 30 THEN '1-30'
          WHEN julianday('now') - julianday("dueDate") <= 60 THEN '31-60'
          WHEN julianday('now') - julianday("dueDate") <= 90 THEN '61-90'
          ELSE '90+'
        END as bucket,
        COUNT(*) as count, COALESCE(SUM(total - "amountPaid"),0) as amount
      FROM invoices WHERE status NOT IN ('paid','void') GROUP BY bucket
    `);
    const order = ['current', '1-30', '31-60', '61-90', '90+'];
    const rowMap = new Map(rows.map(r => [r.bucket, r]));
    return order.map(bucket => ({
      bucket,
      label: bucket === 'current' ? 'Current' : `${bucket} days`,
      count: Number(rowMap.get(bucket)?.count || 0),
      amount: Number(rowMap.get(bucket)?.amount || 0),
    }));
  });

  app.get('/analytics/top-vendors', { preHandler: authMiddleware }, async (req: FastifyRequest) => {
    const { limit = '10' } = req.query as { limit?: string };
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT c.id as customer_id, c.name as customer_name,
             COUNT(i.id) as invoice_count, COALESCE(SUM(i.total),0) as total_spend, COALESCE(SUM(i."amountPaid"),0) as total_paid
      FROM customers c JOIN invoices i ON i."customerId" = c.id
      WHERE i.status != 'void' GROUP BY c.id, c.name ORDER BY total_spend DESC LIMIT ?
    `, parseInt(limit));
    return rows.map(r => ({ customerId: r.customer_id, customerName: r.customer_name, invoiceCount: Number(r.invoice_count), totalSpend: Number(r.total_spend), totalPaid: Number(r.total_paid), outstanding: Number(r.total_spend) - Number(r.total_paid) }));
  });

  app.get('/analytics/by-tag', { preHandler: authMiddleware }, async () => {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT t.tag, COUNT(DISTINCT t."invoiceId") as invoice_count, COALESCE(SUM(i.total),0) as total_spend
      FROM invoice_tags t JOIN invoices i ON i.id = t."invoiceId"
      WHERE i.status != 'void' GROUP BY t.tag ORDER BY total_spend DESC LIMIT 20
    `);
    return rows.map(r => ({ tag: r.tag, invoiceCount: Number(r.invoice_count), totalSpend: Number(r.total_spend) }));
  });

  // Spend by category
  app.get('/analytics/by-category', { preHandler: authMiddleware }, async () => {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT c.id, c.name, c.color,
             COUNT(i.id) as invoice_count, COALESCE(SUM(i.total),0) as total_spend
      FROM categories c JOIN invoices i ON i."categoryId" = c.id
      WHERE i.status != 'void' GROUP BY c.id, c.name, c.color ORDER BY total_spend DESC
    `);
    return rows.map(r => ({ id: r.id, name: r.name, color: r.color, invoiceCount: Number(r.invoice_count), totalSpend: Number(r.total_spend) }));
  });

  app.get('/analytics/overdue', { preHandler: authMiddleware }, async () => {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT i.id, i."invoiceNumber" as invoice_number, i."dueDate" as due_date, i.total,
             i."amountPaid" as amount_paid, i.total - i."amountPaid" as balance,
             CAST(julianday('now') - julianday(i."dueDate") AS INTEGER) as days_overdue,
             c.name as customer_name, c.id as customer_id
      FROM invoices i JOIN customers c ON c.id = i."customerId"
      WHERE i.status NOT IN ('paid','void') AND i."dueDate" IS NOT NULL AND i."dueDate" < datetime('now')
      ORDER BY days_overdue DESC LIMIT 50
    `);
    return rows.map(r => ({ id: r.id, invoiceNumber: r.invoice_number, dueDate: r.due_date, total: Number(r.total), amountPaid: Number(r.amount_paid), balance: Number(r.balance), daysOverdue: Number(r.days_overdue), customerName: r.customer_name, customerId: r.customer_id }));
  });
}
