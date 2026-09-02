import { z } from 'zod';

export const templateFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150, 'Too long'),
  categoryId: z.string().optional().or(z.literal('')),
  renderedHtml: z.string().optional().or(z.literal('')),
});
export type TemplateFormValues = z.infer<typeof templateFormSchema>;
