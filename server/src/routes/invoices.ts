import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import prisma from '../db';
import { recalcTotals } from '../utils/invoiceTotals';
import { generateInvoiceNumber } from '../utils/invoiceNumber';
import { upsertFtsDocument, deleteFtsDocument } from '../services/fts';
import { extractTextFromImage } from '../services/ocr';
import { parseOcrText } from '../services/ocrParser';

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');

const LineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

const CreateInvoiceSchema = z.object({
  customerId: z.string(),
  categoryId: z.string().optional().nullable(),
  invoiceNumber: z.string().optional(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'void']).optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  poNumber: z.string().optional().nullable(),
  taxRate: z.number().min(0).max(100).optional(),
  notes: z.string().max(5000).optional().nullable(),
  tags: z.array(z.string().max(50)).optional(),
  lineItems: z.array(LineItemSchema).optional(),
});

const UpdateInvoiceSchema = CreateInvoiceSchema.partial();

async function buildFtsDoc(invoiceId: string) {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { customer: true, tags: true, attachments: { select: { ocrExtractedText: true } } },
  });
  if (!inv) return;
  await upsertFtsDocument({
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerName: inv.customer.name,
    customerEmail: inv.customer.email || '',
    customerPhone: inv.customer.phone || '',
    poNumber: inv.poNumber || '',
    notes: inv.notes || '',
    tags: inv.tags.map(t => t.tag).join(' '),
    ocrText: inv.attachments.map(a => a.ocrExtractedText || '').join(' '),
    status: inv.status,
  });
}

export default async function invoiceRoutes(app: FastifyInstance, opts: { authMiddleware: any[] }) {
  const { authMiddleware } = opts;

  // List invoices
  app.get('/invoices', { preHandler: authMiddleware }, async (req: FastifyRequest) => {
    const { status, customerId, categoryId, page = '1', pageSize = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const where: any = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (categoryId) where.categoryId = categoryId;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { issueDate: 'desc' },
        include: {
          customer: { select: { id: true, name: true, email: true } },
          category: { select: { id: true, name: true, color: true } },
          tags: true,
          _count: { select: { lineItems: true, attachments: true } },
        },
      }),
      prisma.invoice.count({ where }),
    ]);
    return { invoices, total, page: parseInt(page), pageSize: parseInt(pageSize) };
  });

  // Get single invoice
  app.get('/invoices/:id', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        category: true,
        lineItems: true,
        payments: { orderBy: { paymentDate: 'desc' } },
        attachments: true,
        tags: true,
        invoiceNotes: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
    return invoice;
  });

  // Create invoice
  app.post('/invoices', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;

    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) return reply.status(400).send({ error: 'Customer not found' });

    const invoiceNumber = data.invoiceNumber || (await generateInvoiceNumber());
    const lineItems = (data.lineItems || []).map(li => ({
      ...li,
      total: Math.round(li.quantity * li.unitPrice * 100) / 100,
    }));
    const taxRate = data.taxRate ?? 0;
    const { subtotal, taxAmount, total } = recalcTotals(lineItems, taxRate);

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId: data.customerId,
        categoryId: data.categoryId ?? null,
        status: data.status || 'draft',
        issueDate: data.issueDate ? new Date(data.issueDate) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        poNumber: data.poNumber ?? null,
        taxRate,
        taxAmount,
        subtotal,
        total,
        notes: data.notes ?? null,
        lineItems: { create: lineItems },
        tags: data.tags?.length ? { create: data.tags.map(tag => ({ tag })) } : undefined,
      },
      include: {
        lineItems: true,
        tags: true,
        category: true,
        customer: { select: { id: true, name: true, email: true } },
      },
    });

    await buildFtsDoc(invoice.id);
    return reply.status(201).send(invoice);
  });

  // Update invoice
  app.put('/invoices/:id', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.invoice.findUnique({ where: { id }, include: { lineItems: true } });
    if (!existing) return reply.status(404).send({ error: 'Invoice not found' });

    const data = parsed.data;
    let { subtotal, taxAmount, total } = existing;
    const taxRate = data.taxRate ?? existing.taxRate;

    if (data.lineItems !== undefined) {
      await prisma.lineItem.deleteMany({ where: { invoiceId: id } });
      if (data.lineItems.length > 0) {
        await prisma.lineItem.createMany({
          data: data.lineItems.map(li => ({
            ...li, invoiceId: id, total: Math.round(li.quantity * li.unitPrice * 100) / 100,
          })),
        });
      }
      const recalc = recalcTotals(data.lineItems, taxRate);
      subtotal = recalc.subtotal; taxAmount = recalc.taxAmount; total = recalc.total;
    }

    if (data.tags !== undefined) {
      await prisma.invoiceTag.deleteMany({ where: { invoiceId: id } });
      if (data.tags.length > 0) {
        await prisma.invoiceTag.createMany({ data: data.tags.map(tag => ({ invoiceId: id, tag })) });
      }
    }

    const updateData: any = { subtotal, taxRate, taxAmount, total };
    if (data.status !== undefined) updateData.status = data.status;
    if (data.issueDate !== undefined) updateData.issueDate = new Date(data.issueDate);
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.poNumber !== undefined) updateData.poNumber = data.poNumber;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.customerId !== undefined) updateData.customerId = data.customerId;
    if ('categoryId' in data) updateData.categoryId = data.categoryId ?? null;
    if (data.status === 'paid' && !existing.paidDate) updateData.paidDate = new Date();

    const invoice = await prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        lineItems: true, tags: true, category: true,
        customer: { select: { id: true, name: true, email: true } },
        payments: true, attachments: true,
      },
    });

    await buildFtsDoc(invoice.id);
    return invoice;
  });

  // Delete invoice
  app.delete('/invoices/:id', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Invoice not found' });

    const attachments = await prisma.attachment.findMany({ where: { invoiceId: id } });
    for (const att of attachments) {
      if (fs.existsSync(att.storedPath)) fs.unlinkSync(att.storedPath);
    }
    await prisma.invoice.delete({ where: { id } });
    await deleteFtsDocument(id);
    return reply.status(204).send();
  });

  // ── Line items ────────────────────────────────────────────────────────────
  app.post('/invoices/:id/line-items', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const parsed = LineItemSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { lineItems: true } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });

    const li = await prisma.lineItem.create({
      data: { invoiceId: id, ...parsed.data, total: Math.round(parsed.data.quantity * parsed.data.unitPrice * 100) / 100 },
    });
    const { subtotal, taxAmount, total } = recalcTotals([...invoice.lineItems, li], invoice.taxRate);
    await prisma.invoice.update({ where: { id }, data: { subtotal, taxAmount, total } });
    await buildFtsDoc(id);
    return reply.status(201).send(li);
  });

  app.put('/invoices/:id/line-items/:itemId', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    const parsed = LineItemSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.lineItem.findFirst({ where: { id: itemId, invoiceId: id } });
    if (!existing) return reply.status(404).send({ error: 'Line item not found' });

    const quantity = parsed.data.quantity ?? existing.quantity;
    const unitPrice = parsed.data.unitPrice ?? existing.unitPrice;
    const updated = await prisma.lineItem.update({
      where: { id: itemId },
      data: { ...parsed.data, total: Math.round(quantity * unitPrice * 100) / 100 },
    });
    const inv = await prisma.invoice.findUnique({ where: { id }, include: { lineItems: true } });
    if (inv) {
      const { subtotal, taxAmount, total } = recalcTotals(inv.lineItems, inv.taxRate);
      await prisma.invoice.update({ where: { id }, data: { subtotal, taxAmount, total } });
    }
    return updated;
  });

  app.delete('/invoices/:id/line-items/:itemId', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    await prisma.lineItem.deleteMany({ where: { id: itemId, invoiceId: id } });
    const inv = await prisma.invoice.findUnique({ where: { id }, include: { lineItems: true } });
    if (inv) {
      const { subtotal, taxAmount, total } = recalcTotals(inv.lineItems, inv.taxRate);
      await prisma.invoice.update({ where: { id }, data: { subtotal, taxAmount, total } });
    }
    return reply.status(204).send();
  });

  // ── Payments ──────────────────────────────────────────────────────────────
  const PaymentSchema = z.object({
    amount: z.number().positive(),
    paymentDate: z.string().optional(),
    method: z.enum(['cash', 'check', 'card', 'wire', 'other']).optional().nullable(),
    reference: z.string().max(100).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
  });

  app.post('/invoices/:id/payments', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const parsed = PaymentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { payments: true } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });

    const payment = await prisma.payment.create({
      data: { invoiceId: id, ...parsed.data, paymentDate: parsed.data.paymentDate ? new Date(parsed.data.paymentDate) : new Date() },
    });

    const totalPaid = invoice.payments.reduce((s, p) => s + p.amount, 0) + parsed.data.amount;
    const newAmountPaid = Math.round(totalPaid * 100) / 100;
    const newStatus = newAmountPaid >= invoice.total ? 'paid' : invoice.status === 'draft' ? 'draft' : 'sent';
    await prisma.invoice.update({
      where: { id },
      data: { amountPaid: newAmountPaid, status: newStatus, paidDate: newStatus === 'paid' ? new Date() : invoice.paidDate },
    });
    await buildFtsDoc(id);
    return reply.status(201).send(payment);
  });

  app.delete('/invoices/:id/payments/:paymentId', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, paymentId } = req.params as { id: string; paymentId: string };
    await prisma.payment.deleteMany({ where: { id: paymentId, invoiceId: id } });
    const inv = await prisma.invoice.findUnique({ where: { id }, include: { payments: true } });
    if (inv) {
      const totalPaid = inv.payments.reduce((s, p) => s + p.amount, 0);
      await prisma.invoice.update({ where: { id }, data: { amountPaid: Math.round(totalPaid * 100) / 100, status: totalPaid >= inv.total ? 'paid' : 'sent' } });
    }
    return reply.status(204).send();
  });

  // ── Notes ─────────────────────────────────────────────────────────────────
  app.post('/invoices/:id/notes', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { content } = req.body as { content?: string };
    if (!content?.trim()) return reply.status(400).send({ error: 'content required' });
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
    const note = await prisma.invoiceNote.create({ data: { invoiceId: id, content: content.trim() } });
    await buildFtsDoc(id);
    return reply.status(201).send(note);
  });

  app.delete('/invoices/:id/notes/:noteId', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, noteId } = req.params as { id: string; noteId: string };
    await prisma.invoiceNote.deleteMany({ where: { id: noteId, invoiceId: id } });
    return reply.status(204).send();
  });

  // ── Attachments ───────────────────────────────────────────────────────────
  app.post('/invoices/:id/attachments', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });

    let data: MultipartFile | undefined;
    try { data = await req.file(); } catch { return reply.status(400).send({ error: 'No file uploaded' }); }
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const ext = path.extname(data.filename) || '';
    const storedName = `${uuidv4()}${ext}`;
    const storedPath = path.join(UPLOAD_DIR, storedName);
    await pipeline(data.file, fs.createWriteStream(storedPath));
    const stats = fs.statSync(storedPath);

    // OCR is handled client-side via Puter.js — see PATCH endpoint below
    const attachment = await prisma.attachment.create({
      data: { invoiceId: id, storedPath, originalName: data.filename, mimeType: data.mimetype, size: stats.size, ocrExtractedText: null },
    });
    await buildFtsDoc(id);
    return reply.status(201).send(attachment);
  });

  app.delete('/invoices/:id/attachments/:attachmentId', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, attachmentId } = req.params as { id: string; attachmentId: string };
    const att = await prisma.attachment.findFirst({ where: { id: attachmentId, invoiceId: id } });
    if (!att) return reply.status(404).send({ error: 'Attachment not found' });
    if (fs.existsSync(att.storedPath)) fs.unlinkSync(att.storedPath);
    await prisma.attachment.delete({ where: { id: attachmentId } });
    await buildFtsDoc(id);
    return reply.status(204).send();
  });

  // PATCH /invoices/:id/attachments/:attachmentId — save OCR text from client-side extraction
  app.patch('/invoices/:id/attachments/:attachmentId', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, attachmentId } = req.params as { id: string; attachmentId: string };
    const { ocrText } = req.body as { ocrText?: string };
    const att = await prisma.attachment.findFirst({ where: { id: attachmentId, invoiceId: id } });
    if (!att) return reply.status(404).send({ error: 'Attachment not found' });
    await prisma.attachment.update({
      where: { id: attachmentId },
      data: { ocrExtractedText: ocrText ?? null },
    });
    await buildFtsDoc(id);
    return { ok: true };
  });

  // ── OCR parse (upload screenshot/PDF → extract fields) ────────────────────
  app.post('/invoices/:id/ocr-parse', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });

    let data: MultipartFile | undefined;
    try { data = await req.file(); } catch { return reply.status(400).send({ error: 'No file uploaded' }); }
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const ext = path.extname(data.filename) || '.jpg';
    const storedName = `ocr-tmp-${uuidv4()}${ext}`;
    const storedPath = path.join(UPLOAD_DIR, storedName);
    await pipeline(data.file, fs.createWriteStream(storedPath));

    try {
      const ocrResult = await extractTextFromImage(storedPath);
      const parsedFields = parseOcrText(ocrResult.text);
      const stats = fs.statSync(storedPath);
      const attachment = await prisma.attachment.create({
        data: { invoiceId: id, storedPath, originalName: data.filename, mimeType: data.mimetype, size: stats.size, ocrExtractedText: ocrResult.text },
      });
      await buildFtsDoc(id);
      return { attachment, ocrText: ocrResult.text, confidence: ocrResult.confidence, parsed: parsedFields };
    } catch (err) {
      fs.unlinkSync(storedPath);
      return reply.status(500).send({ error: `OCR failed: ${err}` });
    }
  });
}
