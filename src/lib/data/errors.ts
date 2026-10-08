import type { PostgrestError } from '@supabase/supabase-js';
import { fail, type Result } from './types';

/**
 * Maps database errors to app errors without leaking details. Anything that
 * could reveal whether another tenant's row exists (RLS denial, FK miss,
 * malformed id) becomes the same generic not_found.
 */
export function fromDbError<T = never>(error: PostgrestError, where: string): Result<T> {
  switch (error.code) {
    case '42501': // insufficient_privilege / RLS WITH CHECK violation
    case '23503': // foreign_key_violation (e.g. parent in another workspace)
    case '22P02': // invalid_text_representation (bad uuid)
    case 'P0002': // no_data_found (raised by our RPCs)
    case 'PGRST116': // .single() matched no rows
      return fail('not_found');
    case '23514': // check_violation
    case '23502': // not_null_violation
      return fail('invalid');
    case '23505': // unique_violation
      return fail('conflict');
    default:
      console.error(`[db] ${where} failed`, { code: error.code, message: error.message });
      return fail('unavailable');
  }
}
