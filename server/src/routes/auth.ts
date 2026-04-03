import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db';
import { verifyCredentials, hashPassword } from '../services/auth';

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
      { sub: user.id, username: user.username, displayName: user.displayName },
      { expiresIn: '24h' }
    );
    return { token, user };
  });

  // GET /api/auth/me
  app.get('/auth/me', { preHandler: authenticate }, async (req: FastifyRequest) => {
    return (req as any).user;
  });

  // POST /api/auth/change-password
  app.post('/auth/change-password', { preHandler: authenticate }, async (req: FastifyRequest, reply: FastifyReply) => {
    const caller = (req as any).user as { sub: string; username: string };
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
}
