import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db';
import { z } from 'zod';
import { getUser, locationFilter, assertLocation } from '../middleware/requireAuth';

const CreateCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  zip: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  locationId: z.string().optional().nullable(),
});

export default async function customerRoutes(app: FastifyInstance, opts: { authMiddleware: any[] }) {
  const { authMiddleware } = opts;

  // List customers
  app.get('/customers', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const locFilter = locationFilter(user);
    const { q, page = '1', pageSize = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    const where: any = locFilter ? { ...locFilter } : {};
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { name: 'asc' },
        include: { _count: { select: { invoices: true } } },
      }),
      prisma.customer.count({ where }),
    ]);

    return { customers, total, page: parseInt(page), pageSize: parseInt(pageSize) };
  });

  // Get single customer
  app.get('/customers/:id', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const { id } = req.params as { id: string };
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          orderBy: { issueDate: 'desc' },
          take: 10,
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            total: true,
            issueDate: true,
            dueDate: true,
          },
        },
      },
    });
    if (!customer) return reply.status(404).send({ error: 'Customer not found' });
    if (!assertLocation(user, customer.locationId, reply)) return;
    return customer;
  });

  // Create customer
  app.post('/customers', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const parsed = CreateCustomerSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const isGlobal = user.role === 'owner' || user.role === 'admin';
    const locationId = isGlobal ? (parsed.data.locationId ?? null) : user.locationId;

    const customer = await prisma.customer.create({
      data: { ...parsed.data, locationId },
    });
    return reply.status(201).send(customer);
  });

  // Update customer
  app.put('/customers/:id', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const { id } = req.params as { id: string };
    const parsed = CreateCustomerSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Customer not found' });
    if (!assertLocation(user, existing.locationId, reply)) return;

    const customer = await prisma.customer.update({ where: { id }, data: parsed.data });
    return customer;
  });

  // Delete customer
  app.delete('/customers/:id', { preHandler: authMiddleware }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Customer not found' });
    if (!assertLocation(user, existing.locationId, reply)) return;

    try {
      await prisma.customer.delete({ where: { id } });
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'Customer not found' });
    }
  });
}
