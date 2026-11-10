import { z } from 'zod';
export const businessConfig = z
  .object({
    BUSINESS_JOBS_ENABLED: z.enum(['true', 'false']).default('false'),
    BUSINESS_REDIS_PREFIX: z
      .string()
      .regex(/^[A-Za-z0-9:_-]{1,80}$/)
      .default('leaseflow:business'),
  })
  .parse(process.env);
