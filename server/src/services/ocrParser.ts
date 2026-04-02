/**
 * OCR Parser — regex + heuristic extraction of structured invoice data
 * from raw OCR text output.
 */

export interface ParsedInvoiceData {
  invoiceNumber?: string;
  customerName?: string;
  issueDate?: string;   // ISO date string
  dueDate?: string;     // ISO date string
  poNumber?: string;
  subtotal?: number;
  taxAmount?: number;
  taxRate?: number;
  total?: number;
  lineItems?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

// ── Date helpers ─────────────────────────────────────────────────────────────
const DATE_PATTERNS = [
  // MM/DD/YYYY or MM-DD-YYYY
  /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](20\d{2}|\d{2})\b/,
  // YYYY-MM-DD
  /\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/,
  // DD Month YYYY or Month DD, YYYY
  /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i,
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/i,
];

function parseDate(text: string): Date | null {
  for (const pattern of DATE_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const parsed = new Date(m[0]);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}

function toIso(d: Date | null): string | undefined {
  return d ? d.toISOString().split('T')[0] : undefined;
}

// ── Currency helper ───────────────────────────────────────────────────────────
function parseCurrency(s: string): number | undefined {
  const cleaned = s.replace(/[$,€£\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? undefined : n;
}

// ── Main parser ───────────────────────────────────────────────────────────────
export function parseOcrText(rawText: string): ParsedInvoiceData {
  const result: ParsedInvoiceData = {};
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const lower = rawText.toLowerCase();

  // ── Invoice number
  const invNumMatch = rawText.match(
    /(?:invoice\s*(?:number|no\.?|#)\s*[:–\-]?\s*)([A-Z0-9\-\/]{3,20})/i
  );
  if (invNumMatch) result.invoiceNumber = invNumMatch[1].trim();

  // ── PO number
  const poMatch = rawText.match(
    /(?:p\.?o\.?\s*(?:number|no\.?|#)?\s*[:–\-]?\s*)([A-Z0-9\-\/]{3,20})/i
  );
  if (poMatch) result.poNumber = poMatch[1].trim();

  // ── Customer name — look for "Bill To:", "Customer:", "Client:" followed by a name
  const billToMatch = rawText.match(
    /(?:bill\s*to|customer|client|sold\s*to)\s*[:–\-]?\s*\n?\s*([A-Z][A-Za-z\s\.,&'-]{2,50})/im
  );
  if (billToMatch) result.customerName = billToMatch[1].trim().replace(/\n.*/s, '');

  // ── Dates — look for labeled dates
  const issueDateLine = lines.find((l) =>
    /(?:invoice\s*date|date\s*(?:issued|of\s*issue)|issue\s*date)/i.test(l)
  );
  if (issueDateLine) {
    result.issueDate = toIso(parseDate(issueDateLine));
  }

  const dueDateLine = lines.find((l) =>
    /(?:due\s*date|payment\s*due|pay\s*by)/i.test(l)
  );
  if (dueDateLine) {
    result.dueDate = toIso(parseDate(dueDateLine));
  }

  // Fallback: first two standalone dates in document
  if (!result.issueDate || !result.dueDate) {
    const foundDates: Date[] = [];
    for (const line of lines) {
      for (const pattern of DATE_PATTERNS) {
        const m = line.match(pattern);
        if (m) {
          const d = new Date(m[0]);
          if (!isNaN(d.getTime())) {
            foundDates.push(d);
            break;
          }
        }
      }
      if (foundDates.length >= 2) break;
    }
    if (!result.issueDate && foundDates[0]) result.issueDate = toIso(foundDates[0]);
    if (!result.dueDate && foundDates[1]) result.dueDate = toIso(foundDates[1]);
  }

  // ── Financial totals
  // Match "Total" / "Grand Total" / "Total Due" but NOT "Subtotal"
  const totalMatch = rawText.match(
    /(?<![Ss]ub)(?:grand\s+)?total\s*(?:due|amount)?\s*[:–\-]?\s*\$?\s*([\d,]+\.?\d{0,2})/i
  );
  if (totalMatch) result.total = parseCurrency(totalMatch[1]);

  const subtotalMatch = rawText.match(
    /(?:subtotal|sub\s*total)\s*[:–\-]?\s*\$?\s*([\d,]+\.?\d{0,2})/i
  );
  if (subtotalMatch) result.subtotal = parseCurrency(subtotalMatch[1]);

  const taxMatch = rawText.match(
    /(?:tax|vat|gst|hst)\s*(?:\(?\d[\d.]*%?\)?)?\s*[:–\-]?\s*\$?\s*([\d,]+\.?\d{0,2})/i
  );
  if (taxMatch) result.taxAmount = parseCurrency(taxMatch[1]);

  const taxRateMatch = rawText.match(/(\d[\d.]*)\s*%\s*(?:tax|vat|gst|hst)/i);
  if (taxRateMatch) result.taxRate = parseFloat(taxRateMatch[1]);

  // ── Line items — look for table-like rows: "Description  Qty  Price  Amount"
  // Pattern: text  digits  currency  currency  (with flexible spacing)
  const lineItemPattern =
    /^(.+?)\s{2,}(\d+(?:\.\d+)?)\s{1,}\$?([\d,]+\.\d{2})\s{1,}\$?([\d,]+\.\d{2})\s*$/;
  const lineItems: ParsedInvoiceData['lineItems'] = [];

  for (const line of lines) {
    const m = line.match(lineItemPattern);
    if (m) {
      const description = m[1].trim();
      const quantity = parseFloat(m[2]);
      const unitPrice = parseCurrency(m[3]) || 0;
      const total = parseCurrency(m[4]) || 0;
      if (description.length > 1 && description.length < 200) {
        lineItems.push({ description, quantity, unitPrice, total });
      }
    }
  }
  if (lineItems.length > 0) result.lineItems = lineItems;

  return result;
}
