import '@fastify/jwt';
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      role: 'ADMIN' | 'LEASING_MANAGER' | 'TENANT';
      sid?: string;
      onboarding?: true;
    };
    user: {
      sub: string;
      role: 'ADMIN' | 'LEASING_MANAGER' | 'TENANT';
      sid?: string;
      onboarding?: true;
    };
  }
}
