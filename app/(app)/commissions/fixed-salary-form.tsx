"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { generateFixedSalaryAction, type FormState } from "./actions";

type UserOption = { id: string; name: string };

export function FixedSalaryForm({ users }: { users: UserOption[] }) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    generateFixedSalaryAction,
    undefined
  );
  const t = useTranslations("team");
  const tCommissions = useTranslations("commissions");
  const tCommon = useTranslations("common");
  const now = new Date();

  return (
    <details className="rounded-lg border border-brand-100 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">
        + {tCommissions("generateFixedSalary")}
      </summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("teamMember")}
          <select name="userId" required defaultValue="" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="" disabled>
              {tCommon("choose")}
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {tCommissions("month")}
          <input
            name="month"
            type="number"
            min={1}
            max={12}
            required
            defaultValue={now.getMonth() + 1}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {tCommissions("year")}
          <input
            name="year"
            type="number"
            required
            defaultValue={now.getFullYear()}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        {state?.error && (
          <p className="col-span-full text-sm text-red-600" role="alert">
            {state.error}
          </p>
        )}
        <div className="col-span-full">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {tCommissions("generate")}
          </button>
        </div>
      </form>
    </details>
  );
}
