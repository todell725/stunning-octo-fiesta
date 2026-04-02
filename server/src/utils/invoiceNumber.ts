/**
 * Generates a unique invoice number like INV-2024-0001
 */
import prisma from '../db';

export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  // Find the highest existing invoice number for this year
  const latest = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  let seq = 1;
  if (latest) {
    const parts = latest.invoiceNumber.split('-');
    const last = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(last)) seq = last + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}
