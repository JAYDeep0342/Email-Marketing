import { z } from 'zod';

const optionalStr = z.string().max(200).optional().or(z.literal(''));

export const campaignFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150, 'Too long'),
  subject: z.string().min(1, 'Subject is required').max(200, 'Too long'),
  preheader: optionalStr,
  templateId: z.string().optional().or(z.literal('')),
  signatureId: z.string().optional().or(z.literal('')),
  fromName: optionalStr,
  fromEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  listId: z.string().optional().or(z.literal('')),
  segmentId: z.string().optional().or(z.literal('')),
});
export type CampaignFormValues = z.infer<typeof campaignFormSchema>;
