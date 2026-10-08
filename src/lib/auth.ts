import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Ctx } from '@/lib/data/types';

/**
 * Resolves the current user on the server. getUser() sends the JWT to the Auth
 * server for verification, so a forged or tampered cookie is rejected. (We
 * never use getSession() for identity: it only decodes the cookie.)
 *
 * The user id used anywhere in the app comes from here and nowhere else.
 */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return null;
  return { db, userId: data.user.id, email: data.user.email ?? '' };
});

export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect('/login');
  return ctx;
}
