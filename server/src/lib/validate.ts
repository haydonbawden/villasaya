import type { Request } from 'express';
import { z } from 'zod';
import { badRequest } from './errors.ts';

export function parseBody<T extends z.ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    throw badRequest('Some fields need attention', fieldErrors(result.error));
  }
  return result.data;
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) {
    throw badRequest('Invalid query parameters', fieldErrors(result.error));
  }
  return result.data;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_';
    if (!errors[path]) errors[path] = issue.message;
  }
  return errors;
}

// Shared field schemas -------------------------------------------------------

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email('Enter a valid email address');

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Not a real date');

export const isoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a valid date and time')
  .transform((value) => new Date(value).toISOString());

export const colourSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour such as #0f766e');

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().trim().min(1).max(64).optional(),
});

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
