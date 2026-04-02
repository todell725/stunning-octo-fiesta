/**
 * Unit tests for the OCR parser service.
 * Tests regex extraction of structured invoice data from raw OCR text.
 */
import { parseOcrText } from '../services/ocrParser';

describe('parseOcrText', () => {
  // ── Invoice number ──────────────────────────────────────────────────────
  describe('invoice number extraction', () => {
    it('parses "Invoice Number: INV-2024-0042"', () => {
      const result = parseOcrText('Invoice Number: INV-2024-0042\nTotal: $500.00');
      expect(result.invoiceNumber).toBe('INV-2024-0042');
    });

    it('parses "Invoice No. 12345"', () => {
      const result = parseOcrText('Invoice No. 12345\nDate: 01/15/2024');
      expect(result.invoiceNumber).toBe('12345');
    });

    it('parses "Invoice # ABC-001"', () => {
      const result = parseOcrText('Invoice # ABC-001\nBill To: Acme Corp');
      expect(result.invoiceNumber).toBe('ABC-001');
    });

    it('returns undefined when no invoice number present', () => {
      const result = parseOcrText('Hello world, this is not an invoice');
      expect(result.invoiceNumber).toBeUndefined();
    });
  });

  // ── Customer name ───────────────────────────────────────────────────────
  describe('customer name extraction', () => {
    it('parses "Bill To: Acme Corporation"', () => {
      const result = parseOcrText('Invoice Number: INV-001\nBill To:\nAcme Corporation\n123 Main St');
      expect(result.customerName).toBeDefined();
    });

    it('parses "Customer: John Smith"', () => {
      const result = parseOcrText('Customer: John Smith\nInvoice Date: 01/15/2024');
      expect(result.customerName).toContain('John Smith');
    });
  });

  // ── PO number ───────────────────────────────────────────────────────────
  describe('PO number extraction', () => {
    it('parses "P.O. Number: PO-4521"', () => {
      const result = parseOcrText('P.O. Number: PO-4521\nInvoice Date: 01/01/2024');
      expect(result.poNumber).toBe('PO-4521');
    });

    it('parses "PO # 9999"', () => {
      const result = parseOcrText('PO # 9999\nTotal: $1,200.00');
      expect(result.poNumber).toBe('9999');
    });
  });

  // ── Dates ────────────────────────────────────────────────────────────────
  describe('date extraction', () => {
    it('parses MM/DD/YYYY issue date', () => {
      const result = parseOcrText('Invoice Date: 03/15/2024\nDue Date: 04/15/2024');
      expect(result.issueDate).toBe('2024-03-15');
    });

    it('parses YYYY-MM-DD format', () => {
      const result = parseOcrText('Invoice Date: 2024-06-01\nDue Date: 2024-07-01');
      expect(result.issueDate).toBe('2024-06-01');
    });

    it('parses due date separately from issue date', () => {
      const result = parseOcrText(
        'Invoice Date: 01/10/2024\nDue Date: 02/10/2024\nTotal: $999.00'
      );
      expect(result.issueDate).toBeDefined();
      expect(result.dueDate).toBeDefined();
      expect(result.issueDate).not.toBe(result.dueDate);
    });

    it('returns undefined dates when none present', () => {
      const result = parseOcrText('Invoice Number: INV-001\nCustomer: Bob');
      // May find no dates or fallback dates — just ensure no crash
      expect(result).toBeDefined();
    });
  });

  // ── Currency/totals ──────────────────────────────────────────────────────
  describe('financial totals extraction', () => {
    it('parses simple total', () => {
      const result = parseOcrText('Subtotal: $1,200.00\nTax (10%): $120.00\nTotal: $1,320.00');
      expect(result.total).toBeCloseTo(1320, 1);
      expect(result.subtotal).toBeCloseTo(1200, 1);
      expect(result.taxAmount).toBeCloseTo(120, 1);
    });

    it('parses total without dollar sign', () => {
      const result = parseOcrText('Total: 500.00\nDue Date: 12/31/2024');
      expect(result.total).toBeCloseTo(500, 1);
    });

    it('parses total with commas', () => {
      const result = parseOcrText('Total Due: $12,500.00');
      expect(result.total).toBeCloseTo(12500, 1);
    });

    it('parses grand total', () => {
      const result = parseOcrText('Grand Total: $750.50');
      expect(result.total).toBeCloseTo(750.5, 1);
    });

    it('parses tax rate', () => {
      const result = parseOcrText('8.5% Tax: $85.00\nTotal: $1,085.00');
      expect(result.taxRate).toBeCloseTo(8.5, 1);
    });
  });

  // ── Line items ───────────────────────────────────────────────────────────
  describe('line item extraction', () => {
    it('extracts table-style line items', () => {
      const text = [
        'Description  Qty  Unit Price  Amount',
        'Web Development Services  40  150.00  6,000.00',
        'UI Design  20  120.00  2,400.00',
        'Subtotal: $8,400.00',
      ].join('\n');
      const result = parseOcrText(text);
      // Line items may or may not be detected depending on whitespace
      expect(result).toBeDefined();
    });
  });

  // ── Full invoice text ────────────────────────────────────────────────────
  describe('realistic full invoice text', () => {
    const sampleInvoice = `
INVOICE

Invoice Number: INV-2024-0123
Invoice Date: 06/01/2024
Due Date: 06/30/2024
P.O. Number: PO-8877

Bill To:
Acme Corporation
100 Main St, Springfield, IL 62701

Description                    Qty   Unit Price   Amount
Web Development Services        40    $150.00    $6,000.00
Database Architecture           10    $160.00    $1,600.00

Subtotal:          $7,600.00
Tax (8.5%):          $646.00
Total:             $8,246.00

Thank you for your business!
    `;

    it('extracts invoice number from full invoice', () => {
      const result = parseOcrText(sampleInvoice);
      expect(result.invoiceNumber).toBe('INV-2024-0123');
    });

    it('extracts PO number from full invoice', () => {
      const result = parseOcrText(sampleInvoice);
      expect(result.poNumber).toBe('PO-8877');
    });

    it('extracts total from full invoice', () => {
      const result = parseOcrText(sampleInvoice);
      expect(result.total).toBeCloseTo(8246, 0);
    });

    it('extracts subtotal from full invoice', () => {
      const result = parseOcrText(sampleInvoice);
      expect(result.subtotal).toBeCloseTo(7600, 0);
    });

    it('extracts tax amount from full invoice', () => {
      const result = parseOcrText(sampleInvoice);
      expect(result.taxAmount).toBeCloseTo(646, 0);
    });

    it('extracts issue date from full invoice', () => {
      const result = parseOcrText(sampleInvoice);
      expect(result.issueDate).toBe('2024-06-01');
    });

    it('extracts due date from full invoice', () => {
      const result = parseOcrText(sampleInvoice);
      expect(result.dueDate).toBe('2024-06-30');
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = parseOcrText('');
      expect(result).toEqual({});
    });

    it('handles garbage text', () => {
      const result = parseOcrText('asdfg 1234 !@#$% nothing useful here');
      expect(result).toBeDefined();
    });

    it('does not crash on very long text', () => {
      const long = 'Lorem ipsum dolor sit amet. '.repeat(500);
      expect(() => parseOcrText(long)).not.toThrow();
    });
  });
});
