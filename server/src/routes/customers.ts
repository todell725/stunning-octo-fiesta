import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db';
import { z } from 'zod';

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
});

export default async function customerRoutes(app: FastifyInstance) {
  // List customers
  app.get('/customers', async (req: FastifyRequest, reply: FastifyReply) => {
    const { q, page = '1', pageSize = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const where = q
      ? {
          OR: [
            { name: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : undefined;

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
  app.get('/customers/:id', async (req: FastifyRequest, reply: FastifyReply) => {
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
    return customer;
  });

  // Create customer
  app.post('/customers', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateCustomerSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const customer = await prisma.customer.create({ data: parsed.data });
    return reply.status(201).send(customer);
  });

  // Update customer
  app.put('/customers/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const parsed = CreateCustomerSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    try {
      const customer = await prisma.customer.update({ where: { id }, data: parsed.data });
      return customer;
    } catch {
      return reply.status(404).send({ error: 'Customer not found' });
    }
  });

  // Delete customer
  app.delete('/customers/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    try {
      await prisma.customer.delete({ where: { id } });
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'Customer not found' });
    }
  });
}
