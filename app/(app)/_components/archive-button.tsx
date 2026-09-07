"use client";

import { useTransition } from "react";

export function ArchiveButton({ id, action }: { id: string; action: (id: string) => Promise<void> }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => action(id))}
      className="text-xs text-neutral-500 underline disabled:opacity-50"
    >
      Archiver
    </button>
  );
}
