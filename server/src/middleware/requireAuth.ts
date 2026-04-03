import { FastifyRequest, FastifyReply } from 'fastify';

/** Attached to req after jwtVerify() */
export interface JwtUser {
  sub: string;
  username: string;
  displayName: string;
  role: string;
  locationId: string | null;
  locationName: string | null;
  locationLabel: string | null;
}

/** Pull user off the verified JWT request */
export function getUser(req: FastifyRequest): JwtUser {
  return (req as any).user as JwtUser;
}

/** Build a Prisma `where` clause that scopes to the user's location.
 *  Owner / admin get undefined (no filter = see everything).
 *  Staff get { locationId: user.locationId }.
 */
export function locationFilter(user: JwtUser): { locationId?: string } | undefined {
  if (user.role === 'owner' || user.role === 'admin') return undefined;
  return { locationId: user.locationId ?? '__none__' };
}

/** Throws 403 if a staff user tries to access a resource outside their location */
export function assertLocation(user: JwtUser, resourceLocationId: string | null, reply: FastifyReply): boolean {
  if (user.role === 'owner' || user.role === 'admin') return true;
  if (user.locationId && resourceLocationId === user.locationId) return true;
  reply.status(403).send({ error: 'Access denied — outside your location' });
  return false;
}
