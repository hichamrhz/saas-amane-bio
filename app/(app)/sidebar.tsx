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
    <nav className="flex w-64 shrink-0 flex-col gap-1 border-e border-brand-100 bg-white p-4">
      <div className="mb-4 flex flex-col px-3">
        <span className="text-xl font-bold tracking-tight text-brand-800">Amane</span>
        <span className="-mt-1 text-[10px] font-semibold tracking-[0.35em] text-gold-600">
          BIO
        </span>
      </div>
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
              isActive
                ? "bg-brand-700 text-white"
                : "text-neutral-700 hover:bg-brand-50"
            }`}
          >
            <span>{t(item.messageKey)}</span>
            {!item.implemented && (
              <span
                className={`ms-2 rounded-full px-2 py-0.5 text-[10px] ${
                  isActive ? "bg-white/20" : "bg-cream-dark text-neutral-500"
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
