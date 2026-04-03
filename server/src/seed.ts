/**
 * Seed script — populates the database with realistic sample data.
 * Run: npm run db:seed
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import prisma, { setupFTS } from './db';
import { recalcTotals } from './utils/invoiceTotals';
import { upsertFtsDocument } from './services/fts';
import { hashPassword } from './services/auth';

// ── Locations ──────────────────────────────────────────────────────────────
const LOCATIONS = [
  { name: 'WesternCenter', label: 'Western Center' },
  { name: 'Mansfield',     label: 'Mansfield' },
  { name: 'Vickery',       label: 'Vickery' },
];

// ── Users ──────────────────────────────────────────────────────────────────
// Passwords are printed to the console after seeding.
const USER_DEFS = [
  { username: 'westerncenter', displayName: 'Western Center', role: 'staff',  locationName: 'WesternCenter', password: 'wc1234' },
  { username: 'mansfield',     displayName: 'Mansfield',      role: 'staff',  locationName: 'Mansfield',     password: 'mansfield1234' },
  { username: 'vickery',       displayName: 'Vickery',        role: 'staff',  locationName: 'Vickery',       password: 'vickery1234' },
  { username: 'dave',          displayName: 'Dave',           role: 'owner',  locationName: null,            password: 'dave1234' },
  { username: 'support',       displayName: 'Support',        role: 'admin',  locationName: null,            password: 'support1234' },
];

// ── Sample vendors (split across locations) ────────────────────────────────
const VENDOR_POOL = [
  // Western Center vendors
  { name: 'Arrow Freight Co',      email: 'billing@arrowfreight.com',   phone: '555-100-0001', locationName: 'WesternCenter' },
  { name: 'Summit Supply Chain',   email: 'ap@summitsupply.com',        phone: '555-100-0002', locationName: 'WesternCenter' },
  // Mansfield vendors
  { name: 'MidState Logistics',    email: 'invoices@midstate.com',      phone: '555-200-0001', locationName: 'Mansfield' },
  { name: 'Cornerstone Parts',     email: 'billing@cornerstoneparts.net', phone: '555-200-0002', locationName: 'Mansfield' },
  // Vickery vendors
  { name: 'Vickery Transport LLC', email: 'ap@vickerytransport.com',    phone: '555-300-0001', locationName: 'Vickery' },
  { name: 'Plains Parts & Supply', email: 'orders@plainsparts.com',     phone: '555-300-0002', locationName: 'Vickery' },
  // Shared / cross-location (assigned to all three by Dave)
  { name: 'National Tire Depot',   email: 'fleet@nationaltire.com',     phone: '555-400-0001', locationName: 'WesternCenter' },
  { name: 'National Tire Depot',   email: 'fleet@nationaltire.com',     phone: '555-400-0001', locationName: 'Mansfield' },
  { name: 'National Tire Depot',   email: 'fleet@nationaltire.com',     phone: '555-400-0001', locationName: 'Vickery' },
];

const SERVICES = [
  { description: 'Truck repair — engine overhaul',  unitPrice: 2800 },
  { description: 'Tires — set of 6 (18-wheeler)',   unitPrice: 1800 },
  { description: 'Fuel delivery — diesel (500 gal)', unitPrice: 1650 },
  { description: 'DOT inspection & compliance',      unitPrice: 450 },
  { description: 'Oil change & filter service',      unitPrice: 320 },
  { description: 'Brake system service',             unitPrice: 975 },
  { description: 'Refrigeration unit maintenance',   unitPrice: 1200 },
  { description: 'Inventory parts — miscellaneous',  unitPrice: 600 },
  { description: 'Trailer hitch & coupling repair',  unitPrice: 740 },
  { description: 'Emergency roadside service call',  unitPrice: 390 },
];

const STATUSES: Array<'draft' | 'sent' | 'paid' | 'overdue' | 'void'> = [
  'draft', 'sent', 'paid', 'overdue', 'void',
];

const TAGS = [
  ['truck-repair'],
  ['tires'],
  ['fuel'],
  ['inspection'],
  ['maintenance'],
  ['parts'],
  ['emergency'],
  ['refrigeration'],
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

  await setupFTS();

  // ── Clear existing data (order matters for FK constraints) ─────────────────
  await prisma.invoiceNote.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.invoiceTag.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.lineItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.location.deleteMany();
  await prisma.$executeRawUnsafe(`DELETE FROM invoices_fts`).catch(() => {});

  // ── Create locations ───────────────────────────────────────────────────────
  const locationMap = new Map<string, string>(); // name -> id
  for (const loc of LOCATIONS) {
    const created = await prisma.location.create({ data: loc });
    locationMap.set(loc.name, created.id);
  }
  console.log(`  ✔ Created ${LOCATIONS.length} locations`);

  // ── Create users ───────────────────────────────────────────────────────────
  for (const def of USER_DEFS) {
    const passwordHash = await hashPassword(def.password);
    await prisma.user.create({
      data: {
        username: def.username,
        password: passwordHash,
        displayName: def.displayName,
        role: def.role,
        locationId: def.locationName ? (locationMap.get(def.locationName) ?? null) : null,
      },
    });
  }
  console.log(`  ✔ Created ${USER_DEFS.length} users`);
  console.log('');
  console.log('  Login credentials:');
  for (const u of USER_DEFS) {
    console.log(`    ${u.username.padEnd(16)} / ${u.password}  (${u.role})`);
  }
  console.log('');

  // ── Create customers ───────────────────────────────────────────────────────
  const customers: { id: string; name: string; email: string | null; phone: string | null; locationId: string | null }[] = [];
  for (const v of VENDOR_POOL) {
    const locationId = locationMap.get(v.locationName) ?? null;
    const c = await prisma.customer.create({
      data: {
        name: v.name,
        email: v.email,
        phone: v.phone,
        locationId,
      },
    });
    customers.push({ ...c });
  }
  console.log(`  ✔ Created ${customers.length} customers`);

  // ── Create invoices ────────────────────────────────────────────────────────
  let invoiceSeq = 1;
  const now = new Date();

  for (let i = 0; i < 40; i++) {
    const customer = randomItem(customers);
    const status = randomItem(STATUSES);
    const issueDate = addDays(now, -randomInt(0, 180));
    const dueDate = addDays(issueDate, randomInt(14, 45));
    const invoiceNumber = `INV-${now.getFullYear()}-${String(invoiceSeq++).padStart(4, '0')}`;
    const taxRate = randomItem([0, 0, 0, 5, 8.5]); // mostly no tax on truck invoices
    const tags = randomItem(TAGS);
    const poNumber = Math.random() > 0.4 ? `PO-${randomInt(1000, 9999)}` : null;

    const numItems = randomInt(1, 3);
    const lineItemsData = Array.from({ length: numItems }, () => {
      const svc = randomItem(SERVICES);
      const quantity = randomInt(1, 5);
      return { description: svc.description, quantity, unitPrice: svc.unitPrice };
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
      amountPaid = Math.round(total * 0.5 * 100) / 100;
    }

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId: customer.id,
        locationId: customer.locationId,
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
        notes: Math.random() > 0.6 ? `Fleet invoice — truck service at ${customer.name}` : null,
        lineItems: { create: lineItems },
        tags: { create: tags.map((tag) => ({ tag })) },
      },
    });

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

    if (Math.random() > 0.6) {
      await prisma.invoiceNote.create({
        data: {
          invoiceId: invoice.id,
          content: randomItem([
            'Called vendor — payment expected next week.',
            'Follow up via email sent.',
            'Awaiting PO approval.',
            'Dispute raised — investigating.',
            'Vendor confirmed receipt.',
            'Truck back in service.',
          ]),
        },
      });
    }

    await upsertFtsDocument({
      invoiceId: invoice.id,
      invoiceNumber,
      customerName: customer.name,
      customerEmail: customer.email || '',
      customerPhone: customer.phone || '',
      poNumber: poNumber || '',
      notes: invoice.notes || '',
      tags: tags.join(' '),
      ocrText: '',
      status,
    }).catch(() => {});
  }

  console.log(`  ✔ Created 40 invoices with line items, payments, and notes`);
  console.log('🎉  Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
