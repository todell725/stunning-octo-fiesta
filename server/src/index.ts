import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import jwt from '@fastify/jwt';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load env before anything else
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.join(__dirname, '..', envFile) });

import { setupFTS } from './db';
import authRoutes from './routes/auth';
import customerRoutes from './routes/customers';
import invoiceRoutes from './routes/invoices';
import searchRoutes from './routes/search';
import analyticsRoutes from './routes/analytics';
import categoryRoutes from './routes/categories';

const PORT = parseInt(process.env.PORT || '3001', 10);
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
const JWT_SECRET = process.env.JWT_SECRET || 'invoice-tracker-dev-secret-change-in-prod';

async function buildApp() {
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

  // JWT — must be registered before routes that use authenticate
  await app.register(jwt, { secret: JWT_SECRET });

  // Decorate app with authenticate preHandler
  app.decorate('authenticate', async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.status(401).send({ error: 'Unauthorised' });
    }
  });

  // CORS
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'production' ? false : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Multipart (file uploads)
  await app.register(multipart, {
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '20') * 1024 * 1024,
    },
  });

  // Serve uploaded files
  await app.register(staticFiles, {
    root: UPLOAD_DIR,
    prefix: '/uploads/',
  });

  // Health check (public)
  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  // Auth routes (public — login doesn't need a token)
  await app.register(authRoutes, { prefix: '/api' });

  // All other routes require a valid JWT
  const authMiddleware = [(app as any).authenticate];

  await app.register(categoryRoutes,  { prefix: '/api', authMiddleware });
  await app.register(customerRoutes,  { prefix: '/api', authMiddleware });
  await app.register(invoiceRoutes,   { prefix: '/api', authMiddleware });
  await app.register(searchRoutes,    { prefix: '/api', authMiddleware });
  await app.register(analyticsRoutes, { prefix: '/api', authMiddleware });

  return app;
}

export { buildApp };

async function main() {
  const app = await buildApp();
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
