export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
export type PaymentMethod = 'cash' | 'check' | 'card' | 'wire' | 'other';

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { invoices: number };
}

export interface LineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  paymentDate: string;
  method: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface Attachment {
  id: string;
  invoiceId: string;
  storedPath: string;
  originalName: string;
  mimeType: string;
  size: number;
  ocrExtractedText: string | null;
  uploadedAt: string;
}

export interface InvoiceTag {
  id: string;
  invoiceId: string;
  tag: string;
}

export interface InvoiceNote {
  id: string;
  invoiceId: string;
  content: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customer: Customer;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string | null;
  paidDate: string | null;
  poNumber: string | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: LineItem[];
  payments: Payment[];
  attachments: Attachment[];
  tags: InvoiceTag[];
  invoiceNotes: InvoiceNote[];
  _count?: { lineItems: number; attachments: number };
}

export interface InvoiceListItem extends Omit<Invoice, 'lineItems' | 'payments' | 'attachments' | 'invoiceNotes'> {
  _count: { lineItems: number; attachments: number };
}

export interface ParsedInvoiceData {
  invoiceNumber?: string;
  customerName?: string;
  issueDate?: string;
  dueDate?: string;
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

export interface OcrUploadResult {
  storedPath: string;
  storedName: string;
  originalName: string;
  mimeType: string;
  size: number;
  ocrText: string;
  confidence: number;
  parsed: ParsedInvoiceData;
}

export interface SearchResult {
  invoices: InvoiceSearchRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface InvoiceSearchRow {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string | null;
  paidDate: string | null;
  subtotal: number;
  total: number;
  amountPaid: number;
  poNumber: string | null;
  notes: string | null;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  tags: string[];
}
