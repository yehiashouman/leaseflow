import { z } from 'zod';

export const optionalPage = z.coerce.number().int().min(1).max(10000).optional();
export const listPageSize = 20;

export function pageWindow(page: number) {
  return { skip: (page - 1) * listPageSize, take: listPageSize };
}
