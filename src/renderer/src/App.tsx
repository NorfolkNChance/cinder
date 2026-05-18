import { useEffect, useState } from 'react';

export default function App(): JSX.Element {
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api.app
      .getVersion()
      .then((v) => setVersion(v))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center shadow-2xl">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Cinder</h1>
        {error !== null ? (
          <p className="mt-4 text-red-400">IPC error: {error}</p>
        ) : version !== null ? (
          <p className="mt-4 text-gray-400">
            App version:{' '}
            <span className="font-mono text-emerald-400">{version}</span>
          </p>
        ) : (
          <p className="mt-4 text-gray-500">Loading…</p>
        )}
      </div>
    </div>
  );
}
