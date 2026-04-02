import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * Run raw SQLite statements to create FTS5 virtual tables and triggers.
 * Called once after migrations.
 */
export async function setupFTS(): Promise<void> {
  // FTS5 table for invoice search
  // Regular FTS5 table (not contentless) so DELETE works
  await prisma.$executeRawUnsafe(`
    CREATE VIRTUAL TABLE IF NOT EXISTS invoices_fts USING fts5(
      invoice_id UNINDEXED,
      invoice_number,
      customer_name,
      customer_email,
      customer_phone,
      po_number,
      notes,
      tags,
      ocr_text,
      status UNINDEXED,
      tokenize='porter unicode61'
    )
  `);

  // Trigger to keep FTS in sync when invoices are inserted/updated/deleted
  // We manage FTS population explicitly via the search service to keep it simple
}

export default prisma;
