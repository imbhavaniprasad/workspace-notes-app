import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/env';
import type { Database } from '@/lib/database.types';
import type { Db } from '@/lib/data/types';

/**
 * Per-request client that carries the signed-in user's JWT, so every query runs
 * as role `authenticated` and is subject to RLS. There is deliberately no
 * service-role client anywhere in the app's request path.
 */
export async function createClient(): Promise<Db> {
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session cookie instead.
        }
      },
    },
  });
}
