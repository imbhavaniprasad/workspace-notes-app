import { z } from 'zod';

export const id = z.uuid();
export const role = z.enum(['viewer', 'editor', 'owner']);

export const projectInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.string().trim().max(2000).default(''),
});

export const noteInput = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  body: z.string().max(10000).default(''),
});

export const inviteInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  role,
});
