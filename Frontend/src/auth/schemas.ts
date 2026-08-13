import { z } from 'zod';

/**
 * Zod schemas for auth forms. Zod → react-hook-form → typed form values,
 * all in one shot via @hookform/resolvers.
 *
 * Rules kept aligned with the backend's own class-validator rules where
 * we know them. Backend re-validates every field on submit, so these are
 * for UX only — inline errors before the round trip.
 */

const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long');

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  // Matches the backend's SignupDto field name (companyName), which
  // becomes Tenant.name. Chunk 3 originally shipped this as `tenantName`
  // and the backend rejected it with "property tenantName should not
  // exist" — keep this aligned with SignupDto.
  companyName: z
    .string()
    .min(1, 'Workspace name is required')
    .max(100, 'Workspace name is too long'),
  firstName: z.string().min(1, 'First name is required').max(100),
  email: z.string().min(1, 'Email is required').email('Invalid email'),
  password: passwordRule,
});
export type SignupValues = z.infer<typeof signupSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email'),
});
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordRule,
    confirmPassword: z.string().min(1, 'Please confirm the password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
