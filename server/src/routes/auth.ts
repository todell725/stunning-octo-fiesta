import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyCredentials } from '../services/auth';

export default async function authRoutes(app: FastifyInstance) {
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

  // GET /api/auth/me  — validate token + return current user
  app.get(
    '/auth/me',
    { preHandler: [(app as any).authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      return (req as any).user;
    }
  );
}
