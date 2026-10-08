// Writes .env.local from the running local Supabase stack (`npx supabase status`).
// The values are the CLI's fixed local-development defaults, not real secrets.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));

const env = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  // Test-only: used by the test suite to create throwaway users and verify
  // state. The Next.js app never reads it.
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  DATABASE_URL: status.DB_URL,
};

writeFileSync(
  '.env.local',
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n',
);
console.log('Wrote .env.local');
