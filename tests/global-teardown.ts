import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

/** Removes every throwaway user the suite created (all use @test.local emails). */
export async function teardown() {
  config({ path: '.env.local', quiet: true });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const testUsers = data.users.filter((u) => u.email?.endsWith('@test.local'));
  const ids = testUsers.map((u) => u.id);

  // Workspaces reference their creator, so remove any left behind first.
  if (ids.length) await admin.from('workspaces').delete().in('created_by', ids);
  await Promise.all(ids.map((id) => admin.auth.admin.deleteUser(id)));
}
