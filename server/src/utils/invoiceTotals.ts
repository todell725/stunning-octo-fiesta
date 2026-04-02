/**
 * Recalculates invoice subtotal, tax amount, and total from line items.
 */
export function recalcTotals(
  lineItems: Array<{ quantity: number; unitPrice: number }>,
  taxRate: number
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal: Math.round(subtotal * 100) / 100, taxAmount, total };
}
