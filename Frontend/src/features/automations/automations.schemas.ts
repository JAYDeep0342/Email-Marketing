import { z } from 'zod';

export const automationFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150, 'Too long'),
  triggerType: z.enum([
    'contact_created',
    'contact_added_to_list',
    'email_opened',
    'email_clicked',
    'form_submitted',
    'manual',
  ]),
  // Only meaningful for contact_added_to_list — ignored otherwise.
  listId: z.string().optional().or(z.literal('')),
});
export type AutomationFormValues = z.infer<typeof automationFormSchema>;
