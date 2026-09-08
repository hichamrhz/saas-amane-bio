import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/rbac";
import { getPeriodReport, getLowStockAlerts } from "@/lib/reports/service";
import { formatMoney } from "@/lib/numbers";

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function endOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; threshold?: string }>;
}) {
  const session = await requireSession();
  const t = await getTranslations("reports");
  const tCommon = await getTranslations("common");

  const params = await searchParams;
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const from = params.from ? startOfDay(new Date(params.from)) : startOfDay(defaultFrom);
  const to = params.to ? endOfDay(new Date(params.to)) : endOfDay(today);
  const threshold = params.threshold?.trim() || "10";

  const [report, lowStock] = await Promise.all([
    getPeriodReport(session.organizationId, from, to),
    getLowStockAlerts(session.organizationId, threshold),
  ]);

  const fmtPercent = (rate: number | null) => (rate === null ? "—" : `${(rate * 100).toFixed(0)}%`);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="max-w-2xl text-sm text-neutral-500">{t("description")}</p>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-brand-100 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("from")}
          <input
            type="date"
            name="from"
            defaultValue={from.toISOString().slice(0, 10)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("to")}
          <input
            type="date"
            name="to"
            defaultValue={to.toISOString().slice(0, 10)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          {t("lowStockThreshold")}
          <input
            type="number"
            name="threshold"
            defaultValue={threshold}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          {t("apply")}
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">{t("funnel")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-brand-100 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">{t("ordersPlaced")}</p>
            <p className="mt-1 text-2xl font-semibold text-brand-800">{report.ordersPlaced}</p>
          </div>
          <div className="rounded-lg border border-brand-100 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">{t("confirmationRate")}</p>
            <p className="mt-1 text-2xl font-semibold text-brand-800">{fmtPercent(report.confirmationRate)}</p>
            <p className="text-xs text-neutral-400" dir="ltr">
              {report.ordersConfirmed} / {report.ordersPlaced}
            </p>
          </div>
          <div className="rounded-lg border border-brand-100 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">{t("deliveryRate")}</p>
            <p className="mt-1 text-2xl font-semibold text-brand-800">{fmtPercent(report.deliveryRate)}</p>
            <p className="text-xs text-neutral-400" dir="ltr">
              {report.ordersDelivered} / {report.ordersConfirmed}
            </p>
          </div>
        </div>
        {report.ordersPlaced === 0 && (
          <p className="text-sm text-neutral-400">{t("noOrdersInPeriod")}</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">{t("profitAndLoss")}</h2>
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t border-neutral-100 first:border-t-0">
                <td className="px-4 py-2 text-neutral-500">{t("revenue")}</td>
                <td className="px-4 py-2 text-end font-medium">{formatMoney(report.revenue)} MAD</td>
              </tr>
              <tr className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-500">{t("cogs")}</td>
                <td className="px-4 py-2 text-end font-medium">− {formatMoney(report.cogs)} MAD</td>
              </tr>
              <tr className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-500">{t("commissions")}</td>
                <td className="px-4 py-2 text-end font-medium">− {formatMoney(report.commissions)} MAD</td>
              </tr>
              <tr className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-500">{t("expenses")}</td>
                <td className="px-4 py-2 text-end font-medium">− {formatMoney(report.expenses)} MAD</td>
              </tr>
              <tr className="border-t border-neutral-200 bg-cream-dark/40">
                <td className="px-4 py-2 font-semibold text-neutral-800">{t("netMargin")}</td>
                <td className="px-4 py-2 text-end text-base font-semibold text-brand-800">
                  {formatMoney(report.netMargin)} MAD
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {report.cogsMissingCostCount > 0 && (
          <p className="text-sm text-amber-700">
            {t("cogsMissingCostWarning", { count: report.cogsMissingCostCount })}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-500">{t("lowStock")}</h2>
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark/60 text-start text-xs uppercase text-neutral-500">
              <tr>
                <Th>{tCommon("article")}</Th>
                <Th>{tCommon("location")}</Th>
                <Th>{tCommon("quantity")}</Th>
              </tr>
            </thead>
            <tbody>
              {lowStock.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                    {t("emptyLowStock")}
                  </td>
                </tr>
              )}
              {lowStock.map((row) => (
                <tr key={`${row.variantId}-${row.locationName}`} className="border-t border-neutral-100">
                  <td className="px-4 py-2">
                    {row.articleName} · {row.label} ({row.sku})
                  </td>
                  <td className="px-4 py-2">{row.locationName}</td>
                  <td className="px-4 py-2 font-medium text-red-600">
                    {row.onHand} {row.stockUnitLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-2 font-medium">{children}</th>;
}
