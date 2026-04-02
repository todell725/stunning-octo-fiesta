# Invoice Tracker

A full-stack invoice management system with mobile camera capture, Tesseract.js OCR, SQLite FTS5 full-text search, and complete CRUD for invoices, customers, and payments.

**Stack:** Node.js · TypeScript · Fastify · Prisma · SQLite · React · Vite · TailwindCSS

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18 — [nodejs.org](https://nodejs.org)
- **npm** ≥ 9 (comes with Node)

### 1. Install dependencies

```bash
# Backend
cd server
npm install

# Frontend (new terminal tab)
cd client
npm install
```

### 2. Set up the database

```bash
cd server

# Run migrations (creates SQLite DB + all tables including FTS5)
npx prisma migrate dev --name init

# Generate the Prisma client
npx prisma generate

# Load sample data (5 customers, 30 invoices)
npm run db:seed
```

### 3. Start the backend

```bash
cd server
npm run dev
```

The API server starts at **http://localhost:3001**

### 4. Start the frontend

```bash
cd client
npm run dev
```

The app opens at **http://localhost:5173**

---

## Running Tests

### Backend (OCR parsing + API search)

```bash
cd server
npm test
```

Runs 49 tests:
- `ocrParser.test.ts` — 28 unit tests for invoice text extraction
- `search.test.ts` — 21 API integration tests (search, filters, pagination, CSV)

### Frontend (camera UI smoke tests)

```bash
cd client
npm test
```

Runs 9 smoke tests for the camera capture page.

---

## Using the App

Open **http://localhost:5173** after starting both servers.

| Page | Path | What it does |
|------|------|-------------|
| Dashboard | `/dashboard` | Stats overview + recent invoices |
| Invoices | `/invoices` | List, filter by status, paginate |
| New Invoice | `/invoices/new` | Create invoice with line items |
| Customers | `/customers` | Manage customers |
| Search | `/search` | Full-text search + filters + CSV export |
| Capture | `/capture` | Mobile camera / OCR upload |

---

## OCR & Camera Capture

### On mobile (phone browser)

1. Open **http://\<your-ip\>:5173/capture** on your phone
2. Tap **Open Camera** — uses your rear camera
3. Point at any invoice or receipt and tap **Capture**
4. Tap **Extract Text (OCR)** — Tesseract.js runs on the server
5. Review the **Parsed Fields** tab (invoice #, dates, totals, line items auto-detected)
6. Edit any field, then tap **Apply to New Invoice**
7. The create-invoice form pre-fills with extracted data

> **HTTPS note:** `getUserMedia()` requires HTTPS or `localhost`. For LAN access from a phone, use [ngrok](https://ngrok.com):
> ```bash
> ngrok http 5173
> # Use the https:// URL ngrok gives you on your phone
> ```

### On desktop (file upload)

1. Go to `/capture` and click **Upload Image**
2. Pick any invoice image (JPG, PNG) or PDF
3. OCR runs automatically; review and apply to an invoice

### Via API

```bash
# Upload image → get raw OCR text + parsed fields
curl -X POST http://localhost:3001/api/invoices/upload \
  -F "file=@invoice.jpg"

# Response:
# {
#   "ocrText": "Invoice Number: INV-2024-0001...",
#   "confidence": 82,
#   "parsed": {
#     "invoiceNumber": "INV-2024-0001",
#     "total": 1320,
#     "subtotal": 1200,
#     "issueDate": "2024-06-01",
#     "dueDate": "2024-06-30"
#   }
# }
```

### Switch OCR provider

Edit `server/.env`:

```env
# Default — open source, no API key needed
OCR_PROVIDER=tesseract

# Google Cloud Vision (requires @google-cloud/vision package + credentials)
OCR_PROVIDER=google-vision

# AWS Textract (requires @aws-sdk/client-textract package + AWS credentials)
OCR_PROVIDER=aws-textract
```

---

## Search

The search page (`/search`) supports:

- **Full-text query** — matches invoice numbers, customer names, emails, PO numbers, notes, tags, and OCR-extracted text
- **Filters** — status, total range, issue/due date range, tags
- **Sort** — by date, total, invoice number, or customer name
- **Pagination** — 20 per page
- **CSV export** — downloads all matching results

---

## Environment Variables

Both files are in `server/` — copy and edit as needed.

**`server/.env`** (development):

```env
DATABASE_URL="file:./dev.db"
PORT=3001
UPLOAD_DIR="uploads"
MAX_FILE_SIZE_MB=20
NODE_ENV=development
OCR_PROVIDER=tesseract
```

**`server/.env.test`** (used automatically during `npm test`):

```env
DATABASE_URL="file:./test.db"
PORT=3002
UPLOAD_DIR="uploads_test"
NODE_ENV=test
```

---

## Database Commands

```bash
cd server

# Reset DB and re-seed (wipes all data)
npm run db:reset

# Just re-seed (keeps schema, replaces data)
npm run db:seed

# Open Prisma Studio (visual DB browser)
npx prisma studio
```

---

## Project Structure

```
stunning-octo-fiesta/
├── server/
│   ├── prisma/
│   │   └── schema.prisma          # Data model (7 tables + FTS5 migration)
│   └── src/
│       ├── index.ts               # Fastify app entry point
│       ├── db.ts                  # Prisma client + FTS5 table setup
│       ├── routes/
│       │   ├── invoices.ts        # Invoice CRUD, payments, attachments, OCR
│       │   ├── customers.ts       # Customer CRUD
│       │   └── search.ts          # FTS5 search + CSV export
│       ├── services/
│       │   ├── ocr.ts             # OCR provider factory (Tesseract/Google/AWS)
│       │   ├── ocrParser.ts       # Text → structured invoice fields
│       │   └── fts.ts             # FTS5 index management + search queries
│       ├── utils/
│       │   ├── invoiceTotals.ts   # Subtotal/tax/total calculation
│       │   └── invoiceNumber.ts   # Auto-increment invoice numbers
│       ├── seed.ts                # Sample data
│       └── __tests__/
│           ├── ocrParser.test.ts  # OCR parsing unit tests
│           └── search.test.ts     # API integration tests
└── client/
    └── src/
        ├── App.tsx                # Router + sidebar layout
        ├── pages/
        │   ├── DashboardPage.tsx
        │   ├── InvoicesPage.tsx
        │   ├── InvoiceDetailPage.tsx
        │   ├── InvoiceFormPage.tsx   # OCR prefill support
        │   ├── CustomersPage.tsx
        │   ├── CustomerDetailPage.tsx
        │   ├── SearchPage.tsx
        │   └── CameraCapturePage.tsx # getUserMedia + OCR review panel
        └── test/
            └── CameraCapture.test.tsx
```

---

## API Reference

### Invoices

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/invoices` | List (paginated, filter by status) |
| GET | `/api/invoices/:id` | Get with all relations |
| POST | `/api/invoices` | Create with line items |
| PUT | `/api/invoices/:id` | Update |
| DELETE | `/api/invoices/:id` | Delete + remove attachment files |
| POST | `/api/invoices/:id/line-items` | Add line item |
| PUT | `/api/invoices/:id/line-items/:itemId` | Update line item |
| DELETE | `/api/invoices/:id/line-items/:itemId` | Remove line item |
| POST | `/api/invoices/:id/payments` | Record payment |
| DELETE | `/api/invoices/:id/payments/:paymentId` | Delete payment |
| POST | `/api/invoices/:id/notes` | Add internal note |
| DELETE | `/api/invoices/:id/notes/:noteId` | Delete note |
| POST | `/api/invoices/:id/attachments` | Upload file (OCR runs automatically) |
| DELETE | `/api/invoices/:id/attachments/:attachmentId` | Delete attachment |
| POST | `/api/invoices/:id/ocr-parse` | Upload image → OCR → attach to invoice |
| POST | `/api/invoices/upload` | Upload image → OCR → return parsed fields |

### Customers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/customers` | List (paginated, searchable) |
| GET | `/api/customers/:id` | Get with recent invoices |
| POST | `/api/customers` | Create |
| PUT | `/api/customers/:id` | Update |
| DELETE | `/api/customers/:id` | Delete |

### Search

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/search` | Full-text + filtered search |
| GET | `/api/search/export` | Same, returns CSV download |

**Query params for search:**

| Param | Example | Description |
|-------|---------|-------------|
| `q` | `acme consulting` | Full-text query |
| `status` | `sent` | draft / sent / paid / overdue / void |
| `minTotal` | `500` | Minimum invoice total |
| `maxTotal` | `10000` | Maximum invoice total |
| `issueDateFrom` | `2024-01-01` | Issue date range start |
| `issueDateTo` | `2024-12-31` | Issue date range end |
| `dueDateFrom` | `2024-01-01` | Due date range start |
| `dueDateTo` | `2024-12-31` | Due date range end |
| `tags` | `web,design` | Comma-separated tags |
| `sortBy` | `total` | issueDate / dueDate / total / invoiceNumber / customerName |
| `sortDir` | `desc` | asc / desc |
| `page` | `1` | Page number |
| `pageSize` | `20` | Results per page (max 100) |
