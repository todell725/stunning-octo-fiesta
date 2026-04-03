/**
 * Full-Text Search service.
 * Manages the SQLite FTS5 virtual table `invoices_fts`.
 */
import prisma from '../db';

export interface FtsDocument {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  poNumber: string;
  notes: string;
  tags: string;
  ocrText: string;
  status: string;
}

export async function upsertFtsDocument(doc: FtsDocument): Promise<void> {
  // FTS5 doesn't support UPDATE; delete + re-insert
  await prisma.$executeRawUnsafe(
    `DELETE FROM invoices_fts WHERE invoice_id = ?`,
    doc.invoiceId
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO invoices_fts(invoice_id, invoice_number, customer_name, customer_email, customer_phone, po_number, notes, tags, ocr_text, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    doc.invoiceId,
    doc.invoiceNumber,
    doc.customerName,
    doc.customerEmail,
    doc.customerPhone,
    doc.poNumber,
    doc.notes,
    doc.tags,
    doc.ocrText,
    doc.status
  );
}

export async function deleteFtsDocument(invoiceId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM invoices_fts WHERE invoice_id = ?`,
    invoiceId
  );
}

export interface SearchOptions {
  query?: string;
  status?: string;
  customerId?: string;
  locationId?: string;
  minTotal?: number;
  maxTotal?: number;
  issueDateFrom?: string;
  issueDateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  tags?: string[];
  sortBy?: 'issueDate' | 'dueDate' | 'total' | 'invoiceNumber' | 'customerName';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  invoices: InvoiceSearchRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

interface InvoiceSearchRow {
  id: string;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  paidDate: string | null;
  subtotal: number;
  total: number;
  amountPaid: number;
  poNumber: string | null;
  notes: string | null;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  tags: string[];
}

export async function searchInvoices(opts: SearchOptions): Promise<SearchResult> {
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize || 20));
  const offset = (page - 1) * pageSize;

  // Build WHERE conditions
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts.query && opts.query.trim()) {
    // Use FTS5 match — get matching invoice IDs first
    // Wrap in quotes to handle hyphens, special chars; also add prefix wildcard
    const rawQuery = opts.query.trim();
    // Build an OR query of quoted terms plus a prefix-wildcard version
    const quotedPhrase = `"${rawQuery.replace(/"/g, '""')}"`;
    const ftsQuery = quotedPhrase;
    const ftsRows = await prisma.$queryRawUnsafe<{ invoice_id: string }[]>(
      `SELECT DISTINCT invoice_id FROM invoices_fts WHERE invoices_fts MATCH ?`,
      ftsQuery
    ).catch(async () => {
      // Fallback: try each word as a separate term
      const words = rawQuery.split(/[\s\-_]+/).filter(Boolean);
      if (words.length === 0) return [];
      const wordQuery = words.map(w => `"${w.replace(/"/g, '""')}"*`).join(' OR ');
      return prisma.$queryRawUnsafe<{ invoice_id: string }[]>(
        `SELECT DISTINCT invoice_id FROM invoices_fts WHERE invoices_fts MATCH ?`,
        wordQuery
      ).catch(() => [] as { invoice_id: string }[]);
    });
    const ids = ftsRows.map((r) => r.invoice_id);
    if (ids.length === 0) {
      return { invoices: [], total: 0, page, pageSize, pages: 0 };
    }
    conditions.push(`i.id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }

  if (opts.status) {
    conditions.push(`i.status = ?`);
    params.push(opts.status);
  }

  if (opts.customerId) {
    conditions.push(`i."customerId" = ?`);
    params.push(opts.customerId);
  }

  if (opts.locationId !== undefined) {
    conditions.push(`i."locationId" = ?`);
    params.push(opts.locationId);
  }

  if (opts.minTotal !== undefined) {
    conditions.push(`i.total >= ?`);
    params.push(opts.minTotal);
  }

  if (opts.maxTotal !== undefined) {
    conditions.push(`i.total <= ?`);
    params.push(opts.maxTotal);
  }

  if (opts.issueDateFrom) {
    conditions.push(`i."issueDate" >= ?`);
    params.push(opts.issueDateFrom);
  }

  if (opts.issueDateTo) {
    conditions.push(`i."issueDate" <= ?`);
    params.push(opts.issueDateTo + 'T23:59:59Z');
  }

  if (opts.dueDateFrom) {
    conditions.push(`i."dueDate" >= ?`);
    params.push(opts.dueDateFrom);
  }

  if (opts.dueDateTo) {
    conditions.push(`i."dueDate" <= ?`);
    params.push(opts.dueDateTo + 'T23:59:59Z');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Sort
  const sortMap: Record<string, string> = {
    issueDate: 'i."issueDate"',
    dueDate: 'i."dueDate"',
    total: 'i.total',
    invoiceNumber: 'i."invoiceNumber"',
    customerName: 'c.name',
  };
  const sortCol = sortMap[opts.sortBy || 'issueDate'] || 'i.issue_date';
  const sortDir = opts.sortDir === 'asc' ? 'ASC' : 'DESC';

  // NOTE: Prisma uses camelCase column names in the SQLite schema
  const baseQuery = `
    FROM invoices i
    JOIN customers c ON i."customerId" = c.id
    ${whereClause}
  `;

  // Count
  const countRows = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt ${baseQuery}`,
    ...params
  );
  const total = Number(countRows[0]?.cnt || 0);

  // Data
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT
       i.id,
       i."invoiceNumber" as invoice_number,
       i.status,
       i."issueDate" as issue_date,
       i."dueDate" as due_date,
       i."paidDate" as paid_date,
       i.subtotal,
       i.total,
       i."amountPaid" as amount_paid,
       i."poNumber" as po_number,
       i.notes,
       i."customerId" as customer_id,
       c.name as customer_name,
       c.email as customer_email
     ${baseQuery}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    offset
  );

  // Tags per invoice (batch)
  const invoiceIds = rows.map((r: any) => r.id);
  let tagMap: Record<string, string[]> = {};
  if (invoiceIds.length > 0) {
    const tagRows = await prisma.$queryRawUnsafe<{ invoiceId: string; tag: string }[]>(
      `SELECT "invoiceId", tag FROM invoice_tags WHERE "invoiceId" IN (${invoiceIds.map(() => '?').join(',')})`,
      ...invoiceIds
    );
    for (const t of tagRows) {
      if (!tagMap[t.invoiceId]) tagMap[t.invoiceId] = [];
      tagMap[t.invoiceId].push(t.tag);
    }
  }

  // Filter by tags if requested
  let filteredRows = rows;
  if (opts.tags && opts.tags.length > 0) {
    filteredRows = rows.filter((r: any) => {
      const rowTags = tagMap[r.id] || [];
      return opts.tags!.every((t) => rowTags.includes(t));
    });
  }

  const invoices: InvoiceSearchRow[] = filteredRows.map((r: any) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    status: r.status,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    paidDate: r.paid_date,
    subtotal: Number(r.subtotal),
    total: Number(r.total),
    amountPaid: Number(r.amount_paid),
    poNumber: r.po_number,
    notes: r.notes,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    tags: tagMap[r.id] || [],
  }));

  return {
    invoices,
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  };
}
