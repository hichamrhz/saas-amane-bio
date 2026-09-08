"use client";

import { useState, useTransition } from "react";

export function ActionButton({
  id,
  action,
  label,
  className,
  confirmMessage,
}: {
  id: string;
  action: (id: string) => Promise<void>;
  label: string;
  className?: string;
  confirmMessage?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      try {
        await action(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Une erreur est survenue.");
      }
    });
  };

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className={
          className ??
          "rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        }
      >
        {label}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
