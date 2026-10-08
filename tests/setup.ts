import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'DATABASE_URL']) {
  if (!process.env[key]) {
    throw new Error(`${key} is not set. Start Supabase (npx supabase start) and run "npm run env" first.`);
  }
}
