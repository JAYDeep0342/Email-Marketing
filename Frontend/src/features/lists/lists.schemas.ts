import { z } from 'zod';

/** Same pattern as contacts.schemas.ts / auth/schemas.ts. Backend re-validates. */
export const listFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Too long'),
  description: z.string().max(500, 'Too long').optional().or(z.literal('')),
});
export type ListFormValues = z.infer<typeof listFormSchema>;
