'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

type Props = { current: string; workspaces: { id: string; name: string; role: string }[] };

export function WorkspaceSwitcher({ current, workspaces }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="switcher">
      <span className="muted">Workspace</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => startTransition(() => router.push(`/w/${e.target.value}`))}
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} ({w.role})
          </option>
        ))}
      </select>
      {pending && <span className="muted">Loading...</span>}
    </label>
  );
}
