import { z } from 'zod';

const fieldSchema = z.object({
  name: z.string().min(1, 'Required'),
  label: z.string().min(1, 'Required'),
  required: z.boolean().optional(),
});

export const formFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Too long'),
  type: z.enum(['embedded', 'popup', 'hosted']),
  listId: z.string().optional().or(z.literal('')),
  isActive: z.enum(['true', 'false']),
  fields: z.array(fieldSchema),
});
export type FormFormValues = z.infer<typeof formFormSchema>;
