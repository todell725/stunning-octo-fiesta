/**
 * API integration tests for the search endpoint.
 * Uses a separate test DB (test.db) and Fastify inject (no port binding).
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.test') });

import { buildApp } from '../index';
import prisma, { setupFTS } from '../db';
import { upsertFtsDocument } from '../services/fts';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

async function get(url: string) {
  const res = await app.inject({ method: 'GET', url });
  return {
    status: res.statusCode,
    headers: res.headers,
    body: JSON.parse(res.body || '{}'),
    text: res.body,
  };
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // Ensure FTS table
  await setupFTS();

  // Clean slate
  await prisma.$executeRawUnsafe(`DELETE FROM invoices_fts`).catch(() => {});
  await prisma.invoiceNote.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.invoiceTag.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.lineItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customer.deleteMany();

  // Create customer
  const customer = await prisma.customer.create({
    data: {
      name: 'Test Customer Inc',
      email: 'test@example.com',
      phone: '555-000-0001',
    },
  });

  // Invoice 1 — sent
  const inv1 = await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-TEST-0001',
      customerId: customer.id,
      status: 'sent',
      issueDate: new Date('2024-03-01'),
      dueDate: new Date('2024-03-31'),
      poNumber: 'PO-SEARCH-99',
      subtotal: 1000,
      taxRate: 10,
      taxAmount: 100,
      total: 1100,
      notes: 'Unit test invoice for search testing',
      lineItems: {
        create: [{ description: 'Consulting Services', quantity: 10, unitPrice: 100, total: 1000 }],
      },
      tags: { create: [{ tag: 'test' }, { tag: 'consulting' }] },
    },
  });

  await upsertFtsDocument({
    invoiceId: inv1.id,
    invoiceNumber: 'INV-TEST-0001',
    customerName: 'Test Customer Inc',
    customerEmail: 'test@example.com',
    customerPhone: '555-000-0001',
    poNumber: 'PO-SEARCH-99',
    notes: 'Unit test invoice for search testing',
    tags: 'test consulting',
    ocrText: 'Sample OCR extracted text from scanned document invoice receipt',
    status: 'sent',
  });

  // Invoice 2 — paid
  const inv2 = await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-TEST-0002',
      customerId: customer.id,
      status: 'paid',
      issueDate: new Date('2024-04-01'),
      dueDate: new Date('2024-04-30'),
      subtotal: 5000,
      taxRate: 0,
      taxAmount: 0,
      total: 5000,
      amountPaid: 5000,
      notes: 'Paid invoice for design work',
      lineItems: {
        create: [{ description: 'UI Design', quantity: 40, unitPrice: 125, total: 5000 }],
      },
      tags: { create: [{ tag: 'design' }] },
    },
  });

  await upsertFtsDocument({
    invoiceId: inv2.id,
    invoiceNumber: 'INV-TEST-0002',
    customerName: 'Test Customer Inc',
    customerEmail: 'test@example.com',
    customerPhone: '555-000-0001',
    poNumber: '',
    notes: 'Paid invoice for design work',
    tags: 'design',
    ocrText: '',
    status: 'paid',
  });
}, 30000);

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('GET /api/search', () => {
  it('returns results with no query (all invoices)', async () => {
    const { status, body } = await get('/api/search');
    expect(status).toBe(200);
    expect(body.total).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(body.invoices)).toBe(true);
  });

  it('finds invoice by invoice number FTS', async () => {
    const { status, body } = await get('/api/search?q=INV-TEST-0001');
    expect(status).toBe(200);
    expect(body.invoices.length).toBeGreaterThanOrEqual(1);
    const found = body.invoices.find((i: any) => i.invoiceNumber === 'INV-TEST-0001');
    expect(found).toBeDefined();
  });

  it('finds invoice by customer name FTS', async () => {
    const { status, body } = await get('/api/search?q=Test+Customer');
    expect(status).toBe(200);
    expect(body.invoices.length).toBeGreaterThanOrEqual(1);
  });

  it('finds invoice by PO number FTS', async () => {
    const { status, body } = await get('/api/search?q=PO-SEARCH-99');
    expect(status).toBe(200);
    expect(body.invoices.length).toBeGreaterThanOrEqual(1);
    expect(body.invoices[0].poNumber).toBe('PO-SEARCH-99');
  });

  it('finds invoice by OCR text FTS', async () => {
    const { status, body } = await get('/api/search?q=scanned+document');
    expect(status).toBe(200);
    expect(body.invoices.length).toBeGreaterThanOrEqual(1);
  });

  it('finds invoice by notes FTS', async () => {
    const { status, body } = await get('/api/search?q=design+work');
    expect(status).toBe(200);
    expect(body.invoices.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by status=sent', async () => {
    const { status, body } = await get('/api/search?status=sent');
    expect(status).toBe(200);
    expect(body.invoices.every((i: any) => i.status === 'sent')).toBe(true);
  });

  it('filters by status=paid', async () => {
    const { status, body } = await get('/api/search?status=paid');
    expect(status).toBe(200);
    expect(body.invoices.every((i: any) => i.status === 'paid')).toBe(true);
  });

  it('filters by minTotal', async () => {
    const { status, body } = await get('/api/search?minTotal=2000');
    expect(status).toBe(200);
    expect(body.invoices.every((i: any) => i.total >= 2000)).toBe(true);
  });

  it('filters by maxTotal', async () => {
    const { status, body } = await get('/api/search?maxTotal=2000');
    expect(status).toBe(200);
    expect(body.invoices.every((i: any) => i.total <= 2000)).toBe(true);
  });

  it('returns empty for unmatched query', async () => {
    const { status, body } = await get('/api/search?q=xyzzy12345noresults');
    expect(status).toBe(200);
    expect(body.invoices).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it('paginates correctly with pageSize=1', async () => {
    const { status, body } = await get('/api/search?page=1&pageSize=1');
    expect(status).toBe(200);
    expect(body.invoices).toHaveLength(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(1);
  });

  it('sorts by total asc', async () => {
    const { status, body } = await get('/api/search?sortBy=total&sortDir=asc');
    expect(status).toBe(200);
    const totals = body.invoices.map((i: any) => i.total);
    const sorted = [...totals].sort((a: number, b: number) => a - b);
    expect(totals).toEqual(sorted);
  });

  it('returns correct pagination metadata', async () => {
    const { status, body } = await get('/api/search?pageSize=1');
    expect(status).toBe(200);
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('pages');
    expect(body).toHaveProperty('page');
    expect(body.pages).toBeGreaterThanOrEqual(2);
  });
});

describe('GET /api/search/export', () => {
  it('returns CSV with correct content-type', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search/export' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('CSV contains header row', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search/export' });
    expect(res.body).toContain('invoice_number');
    expect(res.body).toContain('customer_name');
    expect(res.body).toContain('total');
  });

  it('CSV contains data rows', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search/export' });
    expect(res.body).toContain('INV-TEST-0001');
  });
});

describe('GET /api/invoices', () => {
  it('returns invoice list', async () => {
    const { status, body } = await get('/api/invoices');
    expect(status).toBe(200);
    expect(Array.isArray(body.invoices)).toBe(true);
  });

  it('filters by status', async () => {
    const { status, body } = await get('/api/invoices?status=sent');
    expect(status).toBe(200);
    expect(body.invoices.every((i: any) => i.status === 'sent')).toBe(true);
  });
});

describe('GET /api/customers', () => {
  it('returns customer list', async () => {
    const { status, body } = await get('/api/customers');
    expect(status).toBe(200);
    expect(Array.isArray(body.customers)).toBe(true);
  });

  it('finds customer by search query', async () => {
    const { status, body } = await get('/api/customers?q=Test+Customer');
    expect(status).toBe(200);
    expect(body.customers.length).toBeGreaterThanOrEqual(1);
  });
});
