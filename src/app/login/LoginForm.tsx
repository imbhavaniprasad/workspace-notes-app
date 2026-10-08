'use client';

import { useActionState, useState } from 'react';
import { signInAction } from './actions';

const DEMO_USERS = [
  { email: 'alice@acme.test', label: 'Alice, Acme owner' },
  { email: 'bob@acme.test', label: 'Bob, Acme editor + Globex viewer' },
  { email: 'carol@acme.test', label: 'Carol, Acme viewer' },
  { email: 'dave@globex.test', label: 'Dave, Globex owner' },
];

export function LoginForm() {
  const [state, action, pending] = useActionState(signInAction, {});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <form action={action} className="stack card">
      <label className="stack-tight">
        Email
        <input name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="stack-tight">
        Password
        <input
          name="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <div className="row">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? 'Signing in...' : 'Sign in'}
        </button>
        {state.error && (
          <span role="alert" className="error">
            {state.error}
          </span>
        )}
      </div>

      <fieldset className="stack-tight">
        <legend className="muted">Demo accounts from seed data (password: password123)</legend>
        {DEMO_USERS.map((u) => (
          <button
            key={u.email}
            type="button"
            className="btn btn-plain"
            onClick={() => {
              setEmail(u.email);
              setPassword('password123');
            }}
          >
            {u.label}
          </button>
        ))}
      </fieldset>
    </form>
  );
}
