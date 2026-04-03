import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import prisma from '../db';

const CategorySchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color e.g. #6366f1').optional(),
});

export default async function categoryRoutes(app: FastifyInstance, opts: { authMiddleware: any[] }) {
  const { authMiddleware } = opts;

  // List all categories
  app.get('/categories', { preHandler: authMiddleware }, async () => {
    return prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { invoices: true } } },
    });
  });

  // Create category
  app.post('/categories', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = CategorySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    try {
      const category = await prisma.category.create({ data: parsed.data });
      return reply.status(201).send(category);
    } catch {
      return reply.status(409).send({ error: 'A category with that name already exists' });
    }
  });

  // Update category
  app.put('/categories/:id', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const parsed = CategorySchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    try {
      const category = await prisma.category.update({ where: { id }, data: parsed.data });
      return category;
    } catch {
      return reply.status(404).send({ error: 'Category not found' });
    }
  });

  // Delete category (unlinks invoices, does not delete them)
  app.delete('/categories/:id', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    try {
      // Unlink any invoices first
      await prisma.invoice.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
      await prisma.category.delete({ where: { id } });
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'Category not found' });
    }
  });
}
