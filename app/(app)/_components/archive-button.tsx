"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";

export function ArchiveButton({ id, action }: { id: string; action: (id: string) => Promise<void> }) {
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("common");
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => action(id))}
      className="text-xs text-neutral-500 underline disabled:opacity-50"
    >
      {t("delete")}
    </button>
  );
}
