import bcrypt from 'bcryptjs';
import prisma from '../db';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
}

export async function verifyCredentials(username: string, password: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return null;
  return { id: user.id, username: user.username, displayName: user.displayName };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
