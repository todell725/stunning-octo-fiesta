# Invoice Tracker — Full-Stack with OCR + Mobile Camera Capture

A full-featured invoice management system with SQLite FTS5 search, Tesseract.js OCR, mobile camera capture, and complete CRUD for invoices, customers, and payments.

---

## Architecture Overview

```
stunning-octo-fiesta/
├── server/            # Node.js + TypeScript + Fastify backend
│   ├── src/
│   │   ├── index.ts              # App entry point
│   │   ├── db.ts                 # Prisma client + FTS5 setup
│   │   ├── routes/
│   │   │   ├── invoices.ts       # Invoice CRUD + OCR endpoints
│   │   │   ├── customers.ts      # Customer CRUD
│   │   │   └── search.ts         # FTS5 search + CSV export
│   │   ├── services/
│   │   │   ├── ocr.ts            # Pluggable OCR (Tesseract/Google/AWS)
│   │   │   ├── ocrParser.ts      # Regex + heuristic text extraction
│   │   │   └── fts.ts            # FTS5 index management + search
│   │   ├── utils/
│   │   │   ├── invoiceTotals.ts  # Subtotal/tax/total calculation
│   │   │   └── invoiceNumber.ts  # Auto-incrementing invoice numbers
│   │   ├── seed.ts               # Sample data seed
│   │   └── __tests__/
│   │       ├── ocrParser.test.ts # OCR parsing unit tests
│   │       └── search.test.ts    # API search integration tests
│   └── prisma/
│       └── schema.prisma         # Data model
├── client/            # React + Vite + TailwindCSS frontend
│   └── src/
│       ├── pages/
│       │   ├── DashboardPage.tsx
│       │   ├── InvoicesPage.tsx
│       │   ├── InvoiceDetailPage.tsx
│       │   ├── InvoiceFormPage.tsx
│       │   ├── CustomersPage.tsx
│       │   ├── CustomerDetailPage.tsx
│       │   ├── SearchPage.tsx
│       │   └── CameraCapturePage.tsx  # Mobile OCR capture
│       └── test/
│           └── CameraCapture.test.tsx
└── README.md
```

---

## Local Setup

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Set up the database

```bash
cd server
npx prisma migrate dev --name init
npm run db:seed       # Loads 30 sample invoices across 5 customers
```

### 3. Start the backend

```bash
cd server
npm run dev
# Server on http://localhost:3001
```

### 4. Start the frontend

```bash
cd client
npm run dev
# App on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## Features

### Invoices
- Create / edit / delete invoices with line items
- Automatic subtotal + tax + total calculation
- Status management: `draft` → `sent` → `paid` / `overdue` / `void`
- Partial payment recording with payment history
- Internal notes (not visible on invoice)
- Tags for categorization
- PO number tracking

### Customers
- Full CRUD: name, email, phone, address, notes
- Invoice history per customer
- Search by name, email, phone

### Search
- **Full-text search** powered by SQLite FTS5 (Porter stemming)
- Searches across: invoice number, customer name/email/phone, PO number, notes, tags, OCR text
- Filter by: status, total range, issue date range, due date range, tags
- Sort by: date, total, invoice number, customer name
- Pagination (20 per page)
- **Export to CSV** (all matching results)

### OCR & Mobile Camera

See dedicated section below.

---

## How to Test OCR

### Option A — Camera on mobile

1. Open the app on your phone at `http://<your-ip>:5173/capture`
2. Tap **Open Camera** — your phone's rear camera opens
3. Point at any invoice or receipt and tap **Capture**
4. Tap **Extract Text (OCR)** — the server runs Tesseract.js
5. Review the **Parsed Fields** tab: invoice number, dates, totals, line items
6. Edit any field, then click **Apply to New Invoice**
7. The invoice form pre-fills with OCR data; confirm and save

### Option B — Upload an image

1. Navigate to `/capture` (Capture in the sidebar)
2. Click **Upload Image** and pick any invoice image (JPG, PNG, PDF)
3. After upload, OCR runs automatically
4. Review results and click **Apply to New Invoice**

### Option C — Attach OCR image to existing invoice

1. Open any invoice detail page
2. Click **Attach File** (or **Camera**)
3. After upload, OCR runs and extracted text is stored in `attachments.ocr_extracted_text`
4. Extracted text is indexed in FTS5 — immediately searchable

### Option D — API directly

```bash
# Upload image and get OCR + parsed data back
curl -X POST http://localhost:3001/api/invoices/upload \
  -F "file=@/path/to/invoice.jpg"

# Returns:
# {
#   "ocrText": "Invoice Number: INV-2024-0001...",
#   "confidence": 82,
#   "parsed": {
#     "invoiceNumber": "INV-2024-0001",
#     "total": 1320,
#     "subtotal": 1200,
#     ...
#   }
# }
```

### Using a Different OCR Provider

Set the `OCR_PROVIDER` env variable in `server/.env`:

```env
# Default (open source, no API key needed)
OCR_PROVIDER=tesseract

# Google Cloud Vision (requires @google-cloud/vision + GOOGLE_APPLICATION_CREDENTIALS)
OCR_PROVIDER=google-vision

# AWS Textract (requires @aws-sdk/client-textract + AWS credentials)
OCR_PROVIDER=aws-textract
```

---

## How to Use Camera on Mobile

The app uses the browser's native **`getUserMedia()`** API for camera access.

**Requirements:**
- Must be served over **HTTPS** (or `localhost`) — browsers block camera on plain HTTP
- On mobile, the app automatically requests the rear camera (`facingMode: environment`)
- A **flip camera** button lets you switch to the front camera

**Development over local network:**

```bash
# Start the backend with host 0.0.0.0 (already configured)
cd server && npm run dev

# Start the frontend with host flag
cd client && npm run dev -- --host

# Access from your phone: http://192.168.x.x:5173/capture
# Note: getUserMedia works on localhost; for LAN access you may need to
# configure a self-signed cert or use a tunneling service like ngrok
```

**Ngrok for HTTPS tunnel (recommended for mobile testing):**

```bash
ngrok http 5173
# Use the https:// URL provided by ngrok on your phone
```

**Mobile file input fallback:**

On devices where camera API is blocked or unavailable, the **Upload Image** button
opens the native file picker which allows taking a photo on iOS/Android.

---

## Running Tests

### Backend tests (OCR parsing + API search)

```bash
cd server
npm test

# Run with coverage
npm test -- --coverage
```

Tests are in `server/src/__tests__/`:
- `ocrParser.test.ts` — 20+ unit tests for OCR regex extraction
- `search.test.ts` — API integration tests for search, filtering, sorting, CSV export

### Frontend tests (camera UI smoke tests)

```bash
cd client
npm test
```

Test is in `client/src/test/CameraCapture.test.tsx` — renders the camera page and
tests button visibility, getUserMedia error handling, and file input.

---

## API Reference

### Customers
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/customers` | List customers (paginated, searchable) |
| GET | `/api/customers/:id` | Get customer + recent invoices |
| POST | `/api/customers` | Create customer |
| PUT | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete customer |

### Invoices
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/invoices` | List invoices (paginated, filter by status) |
| GET | `/api/invoices/:id` | Get invoice with all relations |
| POST | `/api/invoices` | Create invoice with line items |
| PUT | `/api/invoices/:id` | Update invoice |
| DELETE | `/api/invoices/:id` | Delete invoice + attachments |
| POST | `/api/invoices/:id/line-items` | Add line item |
| PUT | `/api/invoices/:id/line-items/:itemId` | Update line item |
| DELETE | `/api/invoices/:id/line-items/:itemId` | Remove line item |
| POST | `/api/invoices/:id/payments` | Record payment |
| DELETE | `/api/invoices/:id/payments/:paymentId` | Delete payment |
| POST | `/api/invoices/:id/notes` | Add internal note |
| DELETE | `/api/invoices/:id/notes/:noteId` | Delete note |
| POST | `/api/invoices/:id/attachments` | Upload attachment (with OCR) |
| DELETE | `/api/invoices/:id/attachments/:attachmentId` | Delete attachment |
| POST | `/api/invoices/:id/ocr-parse` | OCR-parse an image, attach to invoice |
| POST | `/api/invoices/upload` | Upload + OCR (for new invoice creation) |

### Search
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/search` | Full-text + filtered search |
| GET | `/api/search/export` | Export search results as CSV |

**Search query parameters:**

| Param | Description |
|-------|-------------|
| `q` | Full-text query (FTS5 match) |
| `status` | Filter by status |
| `customerId` | Filter by customer |
| `minTotal` | Minimum total amount |
| `maxTotal` | Maximum total amount |
| `issueDateFrom` | Issue date start (YYYY-MM-DD) |
| `issueDateTo` | Issue date end |
| `dueDateFrom` | Due date start |
| `dueDateTo` | Due date end |
| `tags` | Comma-separated tags to filter |
| `sortBy` | `issueDate` \| `dueDate` \| `total` \| `invoiceNumber` \| `customerName` |
| `sortDir` | `asc` \| `desc` |
| `page` | Page number (default: 1) |
| `pageSize` | Items per page (default: 20, max: 100) |

---

## Data Model

```
customers         — name, email, phone, address, city, state, zip, country, notes
invoices          — customer, status, invoice#, dates, PO#, subtotal, tax, total, paid
line_items        — description, qty, unitPrice, total (FK → invoices, cascade)
payments          — amount, date, method, reference, notes (FK → invoices, cascade)
attachments       — file path, MIME, size, ocrExtractedText (FK → invoices, cascade)
invoice_tags      — tag string (FK → invoices, cascade)
invoice_notes     — internal notes (FK → invoices, cascade)
invoices_fts      — FTS5 virtual table: invoice#, customer, email, phone, PO, notes, tags, OCR text
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./dev.db` | SQLite database path |
| `PORT` | `3001` | Server port |
| `UPLOAD_DIR` | `uploads` | Directory for uploaded files |
| `MAX_FILE_SIZE_MB` | `20` | Max upload size in MB |
| `OCR_PROVIDER` | `tesseract` | OCR backend: `tesseract` \| `google-vision` \| `aws-textract` |
| `NODE_ENV` | `development` | Environment |
