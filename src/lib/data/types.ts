import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

export type Db = SupabaseClient<Database>;
export type Role = Database['public']['Enums']['member_role'];

/** Request context. userId is always the verified session user, never client input. */
export type Ctx = { db: Db; userId: string; email: string };

export type ErrorCode = 'not_found' | 'forbidden' | 'invalid' | 'conflict' | 'unavailable';

export type Result<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

const MESSAGES: Record<ErrorCode, string> = {
  // Identical for "does not exist" and "exists but not yours": no existence oracle.
  not_found: 'Not found.',
  forbidden: 'Your role does not allow this action.',
  invalid: 'Invalid input.',
  conflict: 'That conflicts with existing data.',
  unavailable: 'Something went wrong. Please try again.',
};

export const fail = <T = never>(code: ErrorCode, message = MESSAGES[code]): Result<T> => ({
  ok: false,
  code,
  message,
});
