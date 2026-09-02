import { z } from 'zod';

const conditionSchema = z.object({
  field: z.string().min(1, 'Required'),
  op: z.enum(['eq', 'neq', 'contains']),
  value: z.string().min(1, 'Required'),
});

export const segmentFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150, 'Too long'),
  match: z.enum(['all', 'any']),
  conditions: z.array(conditionSchema).min(1, 'Add at least one condition'),
});
export type SegmentFormValues = z.infer<typeof segmentFormSchema>;
