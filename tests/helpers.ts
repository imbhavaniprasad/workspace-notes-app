import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import type { Database } from '@/lib/database.types';
import { createNote } from '@/lib/data/notes';
import { createProject } from '@/lib/data/projects';
import type { Ctx, Db, Result } from '@/lib/data/types';
import { inviteMember } from '@/lib/data/workspaces';

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client. Test setup/verification only; bypasses RLS by design. */
export const admin = () => createClient<Database>(url(), process.env.SUPABASE_SECRET_KEY!, noSession);

/** A client with no user at all (just the public key), like an anonymous browser. */
export const anonDb = (): Db => createClient<Database>(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, noSession);

export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`);
  return r.data;
}

/** Creates a confirmed user and returns a context signed in as them (real JWT). */
export async function createUser(label: string): Promise<Ctx> {
  const email = `${label}-${randomUUID().slice(0, 8)}@test.local`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: label },
  });
  if (error) throw error;

  const db = anonDb();
  const { error: signInError } = await db.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { db, userId: data.user.id, email };
}

export type Fixture = Awaited<ReturnType<typeof createTenantFixture>>;

/**
 * Two isolated tenants:
 *   A: ownerA (owner), editorA (editor), viewerA (viewer)
 *   B: ownerB (owner)
 * each with one project and one note.
 */
export async function createTenantFixture() {
  const [ownerA, editorA, viewerA, ownerB] = await Promise.all([
    createUser('owner-a'),
    createUser('editor-a'),
    createUser('viewer-a'),
    createUser('owner-b'),
  ]);

  const wsA = await ownerA.db.rpc('create_workspace', { p_name: 'Tenant A' });
  const wsB = await ownerB.db.rpc('create_workspace', { p_name: 'Tenant B' });
  if (wsA.error || wsB.error) throw wsA.error ?? wsB.error;
  const a = wsA.data;
  const b = wsB.data;

  unwrap(await inviteMember(ownerA, a, { email: editorA.email, role: 'editor' }));
  unwrap(await inviteMember(ownerA, a, { email: viewerA.email, role: 'viewer' }));

  const projectA = unwrap(await createProject(ownerA, a, { name: 'A project', description: 'tenant A' }));
  const projectB = unwrap(await createProject(ownerB, b, { name: 'B project', description: 'tenant B secret' }));
  const noteA = unwrap(await createNote(ownerA, a, projectA.id, { title: 'A note', body: 'hello from A' }));
  const noteB = unwrap(await createNote(ownerB, b, projectB.id, { title: 'B note', body: 'secret from B' }));

  const users = [ownerA, editorA, viewerA, ownerB];
  return {
    ownerA,
    editorA,
    viewerA,
    ownerB,
    wsA: a,
    wsB: b,
    projectA,
    projectB,
    noteA,
    noteB,
    async cleanup() {
      const db = admin();
      await db.from('workspaces').delete().in('id', [a, b]);
      await Promise.all(users.map((u) => db.auth.admin.deleteUser(u.userId)));
    },
  };
}

/**
 * Raw SQL exactly as the Data API runs it: switch to role `authenticated` and
 * set the JWT claims for the transaction. userId = null means no claims at all.
 * Always rolled back.
 */
export async function asSqlUser<T>(userId: string | null, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    if (userId) {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
    }
    return await fn(client);
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end();
  }
}

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}
