/**
 * Seed script — populates the database with realistic sample data.
 * Run: npm run db:seed
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import prisma, { setupFTS } from './db';
// Ensure FTS table exists before seeding
import { recalcTotals } from './utils/invoiceTotals';
import { upsertFtsDocument } from './services/fts';

const CUSTOMERS = [
  { name: 'Acme Corporation', email: 'billing@acme.com', phone: '555-100-0001', address: '100 Main St', city: 'Springfield', state: 'IL', zip: '62701', country: 'US' },
  { name: 'Globex Industries', email: 'ap@globex.com', phone: '555-200-0002', address: '200 Industrial Blvd', city: 'Shelbyville', state: 'TN', zip: '37160', country: 'US' },
  { name: 'Initech LLC', email: 'payments@initech.net', phone: '555-300-0003', address: '300 Office Park', city: 'Austin', state: 'TX', zip: '73301', country: 'US' },
  { name: 'Umbrella Corp', email: 'finance@umbrella.org', phone: '555-400-0004', address: '400 Raccoon Rd', city: 'Raccoon City', state: 'MI', zip: '48201', country: 'US' },
  { name: 'Stark Industries', email: 'tony@stark.io', phone: '555-500-0005', address: '500 Malibu Point', city: 'Malibu', state: 'CA', zip: '90265', country: 'US' },
];

const SERVICES = [
  { description: 'Web Development Services', unitPrice: 150 },
  { description: 'UI/UX Design', unitPrice: 120 },
  { description: 'Backend API Development', unitPrice: 140 },
  { description: 'DevOps & CI/CD Setup', unitPrice: 130 },
  { description: 'Database Architecture', unitPrice: 160 },
  { description: 'Security Audit', unitPrice: 200 },
  { description: 'Mobile App Development', unitPrice: 175 },
  { description: 'Tech Support (monthly)', unitPrice: 500 },
  { description: 'Consulting (hourly)', unitPrice: 250 },
  { description: 'Cloud Infrastructure Setup', unitPrice: 300 },
];

const STATUSES: Array<'draft' | 'sent' | 'paid' | 'overdue' | 'void'> = [
  'draft', 'sent', 'paid', 'overdue', 'void',
];

const TAGS = [
  ['web', 'design'],
  ['backend', 'api'],
  ['mobile'],
  ['consulting'],
  ['support', 'monthly'],
  ['priority'],
  ['government'],
  ['retainer'],
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log('🌱  Starting seed...');

  // Create FTS table if not exists
  await setupFTS();

  // Clear existing data
  await prisma.invoiceNote.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.invoiceTag.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.lineItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customer.deleteMany();

  // Clear FTS
  await prisma.$executeRawUnsafe(`DELETE FROM invoices_fts`).catch(() => {});

  // Create customers
  const customers = await Promise.all(
    CUSTOMERS.map((c) => prisma.customer.create({ data: c }))
  );
  console.log(`  ✔ Created ${customers.length} customers`);

  // Create invoices
  let invoiceSeq = 1;
  const now = new Date();

  for (let i = 0; i < 30; i++) {
    const customer = randomItem(customers);
    const status = randomItem(STATUSES);
    const issueDate = addDays(now, -randomInt(0, 180));
    const dueDate = addDays(issueDate, randomInt(14, 60));
    const invoiceNumber = `INV-${now.getFullYear()}-${String(invoiceSeq++).padStart(4, '0')}`;
    const taxRate = randomItem([0, 5, 8.5, 10]);
    const tags = randomItem(TAGS);
    const poNumber = Math.random() > 0.5 ? `PO-${randomInt(1000, 9999)}` : null;

    // Random 1-4 line items
    const numItems = randomInt(1, 4);
    const lineItemsData = Array.from({ length: numItems }, () => {
      const svc = randomItem(SERVICES);
      const quantity = randomInt(1, 40);
      const unitPrice = svc.unitPrice;
      return { description: svc.description, quantity, unitPrice };
    });

    const lineItems = lineItemsData.map((li) => ({
      ...li,
      total: Math.round(li.quantity * li.unitPrice * 100) / 100,
    }));
    const { subtotal, taxAmount, total } = recalcTotals(lineItems, taxRate);

    let amountPaid = 0;
    let paidDate: Date | null = null;
    if (status === 'paid') {
      amountPaid = total;
      paidDate = addDays(dueDate, -randomInt(0, 10));
    } else if (status === 'overdue' && Math.random() > 0.7) {
      amountPaid = Math.round(total * 0.5 * 100) / 100; // partial
    }

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId: customer.id,
        status,
        issueDate,
        dueDate,
        paidDate,
        poNumber,
        taxRate,
        taxAmount,
        subtotal,
        total,
        amountPaid,
        notes: Math.random() > 0.6 ? `Thank you for your business! Net ${randomInt(15, 30)} days.` : null,
        lineItems: { create: lineItems },
        tags: { create: tags.map((tag) => ({ tag })) },
      },
    });

    // Add payment records for paid invoices
    if (status === 'paid') {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: total,
          paymentDate: paidDate!,
          method: randomItem(['check', 'wire', 'card']),
          reference: `REF-${randomInt(10000, 99999)}`,
        },
      });
    } else if (amountPaid > 0) {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: amountPaid,
          paymentDate: addDays(issueDate, randomInt(5, 20)),
          method: 'check',
          notes: 'Partial payment received',
        },
      });
    }

    // Add internal notes to some invoices
    if (Math.random() > 0.6) {
      await prisma.invoiceNote.create({
        data: {
          invoiceId: invoice.id,
          content: randomItem([
            'Called client — payment expected next week.',
            'Follow up via email sent.',
            'Awaiting PO approval from client.',
            'Dispute raised — investigating.',
            'Client confirmed receipt.',
          ]),
        },
      });
    }

    // Update FTS
    const tagsStr = tags.join(' ');
    await upsertFtsDocument({
      invoiceId: invoice.id,
      invoiceNumber,
      customerName: customer.name,
      customerEmail: customer.email || '',
      customerPhone: customer.phone || '',
      poNumber: poNumber || '',
      notes: invoice.notes || '',
      tags: tagsStr,
      ocrText: '',
      status,
    }).catch(() => {});
  }

  console.log(`  ✔ Created 30 invoices with line items, payments, and notes`);
  console.log('🎉  Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
