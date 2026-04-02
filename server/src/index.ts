import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load env before anything else
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.join(__dirname, '..', envFile) });

import { setupFTS } from './db';
import customerRoutes from './routes/customers';
import invoiceRoutes from './routes/invoices';
import searchRoutes from './routes/search';

const PORT = parseInt(process.env.PORT || '3001', 10);
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');

async function buildApp() {
  // Ensure upload directory exists
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // CORS
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'production' ? false : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Multipart (file uploads) — max 20 MB
  await app.register(multipart, {
    limits: {
      fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB || '20') * 1024 * 1024),
    },
  });

  // Serve uploaded files
  await app.register(staticFiles, {
    root: UPLOAD_DIR,
    prefix: '/uploads/',
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  // Register routes
  await app.register(customerRoutes, { prefix: '/api' });
  await app.register(invoiceRoutes, { prefix: '/api' });
  await app.register(searchRoutes, { prefix: '/api' });

  return app;
}

export { buildApp };

async function main() {
  const app = await buildApp();

  // Set up FTS tables (idempotent)
  await setupFTS();

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Server running on http://0.0.0.0:${PORT}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
