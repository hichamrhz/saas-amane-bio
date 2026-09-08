"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { archiveAffiliateAction } from "./actions";

export function ArchiveAffiliateButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("common");
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => archiveAffiliateAction(id))}
      className="text-xs text-neutral-500 underline disabled:opacity-50"
    >
      {t("delete")}
    </button>
  );
}
