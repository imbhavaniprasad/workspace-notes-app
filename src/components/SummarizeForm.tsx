'use client';

import { useState } from 'react';
import type { FormState } from '@/app/actions';
import { ActionForm } from './ActionForm';

type Props = {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  scenarios: readonly string[];
};

/**
 * Summarize button plus the mock-scenario picker. The picker lives outside the
 * <form> so React's automatic reset after an action doesn't snap it back to
 * "normal" mid-demo; its value is sent as a hidden field.
 */
export function SummarizeForm({ action, hidden, scenarios }: Props) {
  const [scenario, setScenario] = useState(scenarios[0]);
  return (
    <div className="stack-tight">
      <label className="stack-tight small">
        <span className="muted">Mock model behaviour (demo)</span>
        <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
          {scenarios.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <ActionForm
        action={action}
        submitLabel="Summarize project"
        pendingLabel="Summarizing..."
        hidden={{ ...hidden, scenario }}
      />
    </div>
  );
}
