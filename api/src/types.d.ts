import '@fastify/jwt';
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: 'ADMIN' | 'LEASING_MANAGER' | 'TENANT'; sid?: string };
    user: { sub: string; role: 'ADMIN' | 'LEASING_MANAGER' | 'TENANT'; sid?: string };
  }
}
