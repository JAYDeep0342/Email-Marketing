import { z } from 'zod';
import { CONTACT_STATUSES } from './contacts.api';

/**
 * Zod schemas for the contacts forms — same pattern as auth/schemas.ts.
 * Backend re-validates (CreateContactDto/UpdateContactDto), these are UX-only.
 */

const optionalName = z
  .string()
  .max(100, 'Too long')
  .optional()
  .or(z.literal(''));

export const createContactSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email'),
  firstName: optionalName,
  lastName: optionalName,
  status: z.enum(CONTACT_STATUSES),
});
export type CreateContactValues = z.infer<typeof createContactSchema>;

// Email can't be changed after creation — UpdateContactDto has no email field.
export const editContactSchema = createContactSchema.omit({ email: true });
export type EditContactValues = z.infer<typeof editContactSchema>;
