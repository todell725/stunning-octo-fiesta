import { FastifyRequest, FastifyReply } from 'fastify';

export interface JwtUser {
  sub: string;
  username: string;
  displayName: string;
}

export function getUser(req: FastifyRequest): JwtUser {
  return (req as any).user as JwtUser;
}
