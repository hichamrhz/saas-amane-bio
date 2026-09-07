"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({
  emailLabel,
  passwordLabel,
  submitLabel,
  invalidCredentialsLabel,
}: {
  emailLabel: string;
  passwordLabel: string;
  submitLabel: string;
  invalidCredentialsLabel: string;
}) {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(
    loginAction,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        {emailLabel}
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        {passwordLabel}
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      </label>
      {state?.error && (
        <p className="text-sm text-red-600" role="alert">
          {invalidCredentialsLabel}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </form>
  );
}
