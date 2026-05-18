import { z } from 'zod';

export const GetVersionResponseSchema = z.string().min(1);
export type GetVersionResponse = z.infer<typeof GetVersionResponseSchema>;
