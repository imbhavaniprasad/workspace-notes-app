'use client';

import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import type { FormState } from '@/app/actions';

type Props = {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  hidden?: Record<string, string>;
  resetOnSuccess?: boolean;
  variant?: 'primary' | 'danger' | 'plain';
  className?: string;
  children?: ReactNode;
};

/** A form bound to a server action, with pending, error and success states. */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = 'Working...',
  hidden = {},
  resetOnSuccess = false,
  variant = 'primary',
  className,
  children,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className={className ?? 'stack'} aria-busy={pending}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div className="row">
        <button type="submit" disabled={pending} className={`btn btn-${variant}`}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {!pending && state.error && (
          <span role="alert" className="error">
            {state.error}
          </span>
        )}
        {!pending && state.ok && state.message && <span className="success">{state.message}</span>}
      </div>
      {state.log && state.log.length > 0 && (
        <ol className="attempts" aria-label="Model attempts">
          {state.log.map((a) => (
            <li key={a.attempt} className={a.outcome}>
              Attempt {a.attempt}: {a.outcome} ({a.detail})
            </li>
          ))}
        </ol>
      )}
    </form>
  );
}
