import { redirect } from 'next/navigation';
import { getCtx } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  if (await getCtx()) redirect('/');
  return (
    <main className="narrow stack">
      <h1>Workspace Notes</h1>
      <LoginForm />
    </main>
  );
}
