import bcrypt from 'bcryptjs';
import prisma from '../db';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: string;          // 'staff' | 'owner' | 'admin'
  locationId: string | null;
  locationName: string | null;
  locationLabel: string | null;
}

/** Returns true if the user can access all locations */
export function isGlobal(user: AuthUser): boolean {
  return user.role === 'owner' || user.role === 'admin';
}

/** Verifies username + password, returns AuthUser or null */
export async function verifyCredentials(
  username: string,
  password: string
): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    include: { location: true },
  });
  if (!user) return null;

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    locationId: user.locationId,
    locationName: user.location?.name ?? null,
    locationLabel: user.location?.label ?? null,
  };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
