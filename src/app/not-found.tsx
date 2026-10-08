import Link from 'next/link';

// Same page whether the resource doesn't exist or belongs to another workspace.
export default function NotFound() {
  return (
    <main className="narrow stack">
      <h1>Not found</h1>
      <p className="muted">This page doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Link href="/">Go to your workspaces</Link>
    </main>
  );
}
