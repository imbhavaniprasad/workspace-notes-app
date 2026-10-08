'use client';

export default function WorkspaceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="card stack" role="alert">
      <h2>Something went wrong</h2>
      <p className="muted">
        We could not load this page. {error.digest ? `Reference: ${error.digest}` : ''}
      </p>
      <div>
        <button className="btn btn-primary" onClick={() => retry()}>
          Try again
        </button>
      </div>
    </div>
  );
}
