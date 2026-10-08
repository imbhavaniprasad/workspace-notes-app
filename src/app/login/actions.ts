'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const credentials = z.object({ email: z.email(), password: z.string().min(1) });

export async function signInAction(_: { error?: string }, fd: FormData): Promise<{ error?: string }> {
  const parsed = credentials.safeParse({ email: fd.get('email'), password: fd.get('password') });
  if (!parsed.success) return { error: 'Enter your email and password.' };

  const db = await createClient();
  const { error } = await db.auth.signInWithPassword(parsed.data);
  if (error) return { error: 'Invalid email or password.' };
  redirect('/');
}
