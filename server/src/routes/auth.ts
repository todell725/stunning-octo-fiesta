import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db';
import { verifyCredentials, hashPassword } from '../services/auth';
import { getUser } from '../middleware/requireAuth';

export default async function authRoutes(app: FastifyInstance) {
  const authenticate = [(app as any).authenticate];

  // POST /api/auth/login
  app.post('/auth/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      return reply.status(400).send({ error: 'username and password required' });
    }

    const user = await verifyCredentials(username.trim(), password);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid username or password' });
    }

    const token = (app as any).jwt.sign(
      {
        sub: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        locationId: user.locationId,
        locationName: user.locationName,
        locationLabel: user.locationLabel,
      },
      { expiresIn: '12h' }
    );

    return { token, user };
  });

  // GET /api/auth/me — validate token + return current user
  app.get('/auth/me', { preHandler: authenticate }, async (req: FastifyRequest) => {
    return (req as any).user;
  });

  // POST /api/auth/change-password — any logged-in user changes their own password
  app.post('/auth/change-password', { preHandler: authenticate }, async (req: FastifyRequest, reply: FastifyReply) => {
    const caller = getUser(req);
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return reply.status(400).send({ error: 'currentPassword and newPassword required' });
    }
    if (newPassword.length < 6) {
      return reply.status(400).send({ error: 'New password must be at least 6 characters' });
    }

    // Verify current password against DB
    const valid = await verifyCredentials(caller.username, currentPassword);
    if (!valid) {
      return reply.status(401).send({ error: 'Current password is incorrect' });
    }

    await prisma.user.update({
      where: { id: caller.sub },
      data: { password: await hashPassword(newPassword) },
    });

    return { ok: true };
  });

  // POST /api/auth/admin/reset-password — owner or admin resets any user's password
  app.post('/auth/admin/reset-password', { preHandler: authenticate }, async (req: FastifyRequest, reply: FastifyReply) => {
    const caller = getUser(req);
    if (caller.role !== 'owner' && caller.role !== 'admin') {
      return reply.status(403).send({ error: 'Not authorised' });
    }

    const { username, newPassword } = req.body as {
      username?: string;
      newPassword?: string;
    };

    if (!username || !newPassword) {
      return reply.status(400).send({ error: 'username and newPassword required' });
    }
    if (newPassword.length < 6) {
      return reply.status(400).send({ error: 'New password must be at least 6 characters' });
    }

    const target = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    if (!target) {
      return reply.status(404).send({ error: 'User not found' });
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { password: await hashPassword(newPassword) },
    });

    return { ok: true };
  });

  // GET /api/auth/admin/users — owner or admin lists all users (for reset UI)
  app.get('/auth/admin/users', { preHandler: authenticate }, async (req: FastifyRequest, reply: FastifyReply) => {
    const caller = getUser(req);
    if (caller.role !== 'owner' && caller.role !== 'admin') {
      return reply.status(403).send({ error: 'Not authorised' });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        location: { select: { label: true } },
      },
      orderBy: { displayName: 'asc' },
    });

    return users.map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      locationLabel: u.location?.label ?? null,
    }));
  });
}
