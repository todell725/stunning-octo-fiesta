/**
 * First-run setup — creates your user account.
 * Run: npm run db:seed
 *
 * Set these env vars before running (or edit the defaults below):
 *   ADMIN_USERNAME   — your login username  (default: admin)
 *   ADMIN_PASSWORD   — your login password  (default: changeme)
 *   ADMIN_NAME       — your display name    (default: Me)
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import prisma, { setupFTS } from './db';
import { hashPassword } from './services/auth';

async function main() {
  await setupFTS();

  const username    = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const password    = process.env.ADMIN_PASSWORD  || 'changeme';
  const displayName = process.env.ADMIN_NAME      || 'Me';

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`User "${username}" already exists — skipping.`);
    console.log('To reset your password, use the Settings page inside the app.');
    return;
  }

  await prisma.user.create({
    data: { username, password: await hashPassword(password), displayName },
  });

  console.log('');
  console.log('✅  Account created!');
  console.log(`    Username : ${username}`);
  console.log(`    Password : ${password}`);
  console.log('');
  console.log('    👉  Log in and change your password immediately via Settings.');
  console.log('');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
