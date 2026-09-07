"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NAV_ITEMS } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");

  return (
    <nav className="flex w-64 shrink-0 flex-col gap-1 border-e border-neutral-200 bg-white p-4">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
              isActive
                ? "bg-neutral-900 text-white"
                : "text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            <span>{t(item.messageKey)}</span>
            {!item.implemented && (
              <span
                className={`ms-2 rounded-full px-2 py-0.5 text-[10px] ${
                  isActive ? "bg-white/20" : "bg-neutral-200 text-neutral-500"
                }`}
              >
                {tCommon("soon")}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
