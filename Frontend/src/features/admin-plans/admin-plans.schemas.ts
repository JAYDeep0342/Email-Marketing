import { z } from 'zod';

const optionalCount = z.string().optional().or(z.literal(''));

export const planFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150, 'Too long'),
  // Only used in create mode — Plan.code can't be changed after creation.
  code: z
    .string()
    .min(1, 'Code is required')
    .max(50, 'Too long')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, and hyphens only'),
  price: z
    .string()
    .min(1, 'Price is required')
    .refine((v) => !Number.isNaN(parseFloat(v)) && parseFloat(v) >= 0, 'Invalid price'),
  currencyId: z.string().optional().or(z.literal('')),
  billingPeriod: z.enum(['monthly', 'yearly']),
  planType: z.string().min(1, 'Required').max(50, 'Too long'),
  isActive: z.enum(['true', 'false']),
  maxContacts: optionalCount,
  maxLists: optionalCount,
  maxEmailsMonth: optionalCount,
  maxEmailsDay: optionalCount,
  maxUsers: optionalCount,
  maxCampaigns: optionalCount,
  maxAutomations: optionalCount,
  dedicatedIp: z.enum(['true', 'false']),
  aiEnabled: z.enum(['true', 'false']),
});
export type PlanFormValues = z.infer<typeof planFormSchema>;
