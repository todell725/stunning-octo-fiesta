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
const USER_DEFS = [
  { username: 'westerncenter', displayName: 'Western Center', role: 'staff',  locationName: 'WesternCenter', password: 'wc1234' },
  { username: 'mansfield',     displayName: 'Mansfield',      role: 'staff',  locationName: 'Mansfield',     password: 'mansfield1234' },
  { username: 'vickery',       displayName: 'Vickery',        role: 'staff',  locationName: 'Vickery',       password: 'vickery1234' },
  { username: 'dave',          displayName: 'Dave',           role: 'owner',  locationName: null,            password: 'dave1234' },
];

// ── Vendors (pizza franchise suppliers) ───────────────────────────────────
const VENDOR_POOL = [
  // Western Center
  { name: 'Sysco Foods',             email: 'billing@sysco.com',          phone: '555-100-0001', locationName: 'WesternCenter' },
  { name: 'Roma Foods Distributor',  email: 'ap@romafoods.com',           phone: '555-100-0002', locationName: 'WesternCenter' },
  // Mansfield
  { name: 'US Foods',                email: 'invoices@usfoods.com',       phone: '555-200-0001', locationName: 'Mansfield' },
  { name: 'Bacio Cheese Co.',        email: 'billing@baciocheese.com',    phone: '555-200-0002', locationName: 'Mansfield' },
  // Vickery
  { name: 'Performance Food Group',  email: 'ap@pfgc.com',               phone: '555-300-0001', locationName: 'Vickery' },
  { name: 'Stanislaus Food Products',email: 'orders@stanislaus.com',     phone: '555-300-0002', locationName: 'Vickery' },
  // Shared suppliers (one entry per location)
  { name: 'Cintas Uniform Services', email: 'billing@cintas.com',        phone: '555-400-0001', locationName: 'WesternCenter' },
  { name: 'Cintas Uniform Services', email: 'billing@cintas.com',        phone: '555-400-0001', locationName: 'Mansfield' },
  { name: 'Cintas Uniform Services', email: 'billing@cintas.com',        phone: '555-400-0001', locationName: 'Vickery' },
  { name: 'Arctic Air HVAC & Equip', email: 'service@arcticair.com',     phone: '555-500-0001', locationName: 'WesternCenter' },
  { name: 'Arctic Air HVAC & Equip', email: 'service@arcticair.com',     phone: '555-500-0001', locationName: 'Mansfield' },
  { name: 'Arctic Air HVAC & Equip', email: 'service@arcticair.com',     phone: '555-500-0001', locationName: 'Vickery' },
];

// ── Line item types ────────────────────────────────────────────────────────
const SUPPLIES = [
  { description: 'Mozzarella cheese — 6 lb bags (case of 6)',  unitPrice: 148 },
  { description: 'Pizza dough balls — 16 oz (case of 48)',      unitPrice: 96  },
  { description: 'Crushed tomato sauce — #10 cans (case of 6)', unitPrice: 58  },
  { description: 'Pepperoni — sliced, 25 lb bag',               unitPrice: 112 },
  { description: 'Pizza boxes — 16" (bundle of 50)',            unitPrice: 44  },
  { description: 'Corrugated box liners (case of 200)',         unitPrice: 32  },
  { description: 'Cooking oil — soy blend, 35 lb jug',         unitPrice: 68  },
  { description: 'Italian sausage — crumbled, 10 lb roll',     unitPrice: 89  },
  { description: 'Shredded parmesan — 5 lb bag',               unitPrice: 47  },
  { description: 'Disposable gloves — box of 100',             unitPrice: 18  },
  { description: 'Food-safe sanitizer — 2.5 gal',              unitPrice: 29  },
  { description: 'Paper napkins — restaurant pack (3000 ct)',   unitPrice: 36  },
  { description: 'Walk-in cooler repair & service call',        unitPrice: 320 },
  { description: 'Oven conveyor belt replacement',              unitPrice: 485 },
  { description: 'Hood vent cleaning service',                  unitPrice: 275 },
  { description: 'POS system maintenance — monthly',           unitPrice: 150 },
  { description: 'Uniforms & aprons — staff (monthly)',         unitPrice: 210 },
  { description: 'Grease trap pump-out service',                unitPrice: 195 },
];

const STATUSES: Array<'draft' | 'sent' | 'paid' | 'overdue' | 'void'> = [
  'paid', 'paid', 'paid', 'sent', 'overdue', 'draft',
];

const TAGS = [
  ['food'],
  ['cheese'],
  ['packaging'],
  ['equipment'],
  ['maintenance'],
  ['uniforms'],
  ['supplies'],
  ['produce'],
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

  // ── Clear existing data ────────────────────────────────────────────────────
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

  // ── Locations ──────────────────────────────────────────────────────────────
  const locationMap = new Map<string, string>();
  for (const loc of LOCATIONS) {
    const created = await prisma.location.create({ data: loc });
    locationMap.set(loc.name, created.id);
  }
  console.log(`  ✔ Created ${LOCATIONS.length} locations`);

  // ── Users ──────────────────────────────────────────────────────────────────
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

  // ── Customers ──────────────────────────────────────────────────────────────
  const customers: { id: string; name: string; email: string | null; phone: string | null; locationId: string | null }[] = [];
  for (const v of VENDOR_POOL) {
    const locationId = locationMap.get(v.locationName) ?? null;
    const c = await prisma.customer.create({
      data: { name: v.name, email: v.email, phone: v.phone, locationId },
    });
    customers.push({ ...c });
  }
  console.log(`  ✔ Created ${customers.length} vendors/suppliers`);

  // ── Invoices ───────────────────────────────────────────────────────────────
  let invoiceSeq = 1;
  const now = new Date();

  for (let i = 0; i < 45; i++) {
    const customer = randomItem(customers);
    const status = randomItem(STATUSES);
    const issueDate = addDays(now, -randomInt(0, 90));
    const dueDate = addDays(issueDate, randomInt(14, 30));
    const invoiceNumber = `INV-${now.getFullYear()}-${String(invoiceSeq++).padStart(4, '0')}`;
    const taxRate = 0; // food/supply invoices typically no sales tax
    const tags = randomItem(TAGS);
    const poNumber = Math.random() > 0.4 ? `PO-${randomInt(1000, 9999)}` : null;

    const numItems = randomInt(1, 4);
    const lineItemsData = Array.from({ length: numItems }, () => {
      const svc = randomItem(SUPPLIES);
      const quantity = randomInt(1, 8);
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
      paidDate = addDays(issueDate, randomInt(7, 21));
    } else if (status === 'overdue' && Math.random() > 0.6) {
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
        notes: Math.random() > 0.6
          ? randomItem([
              'Weekly standing order.',
              'Delivery confirmed — received short by 2 cases, credit requested.',
              'Price increase effective next order — check contract.',
              'Paid via company check.',
              'Net 30 terms.',
            ])
          : null,
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
          paymentDate: addDays(issueDate, randomInt(5, 15)),
          method: 'check',
          notes: 'Partial payment — balance pending',
        },
      });
    }

    if (Math.random() > 0.65) {
      await prisma.invoiceNote.create({
        data: {
          invoiceId: invoice.id,
          content: randomItem([
            'Called supplier — payment confirmed.',
            'Awaiting credit memo for short delivery.',
            'Matched to PO — approved for payment.',
            'Price discrepancy — checking with supplier.',
            'Recurring weekly order.',
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

  console.log(`  ✔ Created 45 invoices with line items, payments, and notes`);
  console.log('🎉  Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
