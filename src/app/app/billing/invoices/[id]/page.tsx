import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { getAppContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/roles";
import { countryName } from "@/lib/countries";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Invoice" };

type Line = { description?: string; amount_cents?: number; period_start?: string; period_end?: string };
type Snapshot = Partial<Record<"name" | "vat_number" | "registration_number" | "billing_email" | "address_line1" | "address_line2" | "city" | "postal_code" | "country_code", string>>;

const day = (iso?: string) => (iso ? (formatDateTime(iso).split(",")[0] ?? "") : "");

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAppContext();
  if (!can.manageBilling(ctx.role)) notFound();

  const { data: invoice } = await ctx.supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!invoice) notFound();

  const lines = (Array.isArray(invoice.line_items) ? invoice.line_items : []) as Line[];
  const to = (invoice.billing_snapshot ?? {}) as Snapshot;
  const seller = { name: "LexConv", address: "", email: "ceo@lexconv.com", tax_note: "", ...((invoice.seller_snapshot ?? {}) as Record<string, string>) };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/app/billing" className="type-small text-primary underline-offset-4 hover:underline">
          Back to billing
        </Link>
        <PrintButton />
      </div>

      <article className="grid gap-10 rounded-panel border border-line bg-surface p-6 md:p-10 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="grid gap-3">
            <Logo />
            <div className="type-small text-ink-muted">
              <p className="font-semibold text-ink">{seller.name}</p>
              {seller.address
                ? seller.address.split("\n").map((line, i) => <p key={i}>{line}</p>)
                : null}
              <p>{seller.email}</p>
            </div>
          </div>
          <div className="grid gap-1 text-right">
            <h1 className="type-h1 text-ink">Invoice</h1>
            <p className="tabular type-small text-ink">{invoice.number}</p>
            <p className="type-small text-ink-muted">Issued {day(invoice.issued_at)}</p>
            <p className="type-small font-semibold text-ok">{invoice.status === "paid" ? "Paid" : invoice.status}</p>
          </div>
        </header>

        <section className="grid gap-1 type-small">
          <h2 className="type-caption text-ink-muted">Billed to</h2>
          <p className="font-semibold text-ink">{to.name}</p>
          {to.address_line1 ? <p className="text-ink-muted">{to.address_line1}</p> : null}
          {to.address_line2 ? <p className="text-ink-muted">{to.address_line2}</p> : null}
          {to.city || to.postal_code ? <p className="text-ink-muted">{[to.postal_code, to.city].filter(Boolean).join(" ")}</p> : null}
          <p className="text-ink-muted">{countryName(to.country_code)}</p>
          {to.vat_number ? <p className="text-ink-muted">VAT {to.vat_number}</p> : null}
          {to.registration_number ? <p className="text-ink-muted">Company no. {to.registration_number}</p> : null}
        </section>

        <table className="w-full border-collapse type-small">
          <caption className="sr-only">Invoice lines</caption>
          <thead>
            <tr className="border-b border-line text-left text-ink-muted">
              <th scope="col" className="py-2 font-medium">Description</th>
              <th scope="col" className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-3 text-ink">
                  {line.description}
                  {line.period_start && line.period_end ? (
                    <span className="block type-caption text-ink-muted">
                      {day(line.period_start)} to {day(line.period_end)}
                    </span>
                  ) : null}
                </td>
                <td className="py-3 text-right tabular text-ink">{formatMoney(line.amount_cents ?? 0, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-4 text-left font-semibold text-ink">Total</th>
              <td className="pt-4 text-right text-lg font-semibold tabular text-ink">
                {formatMoney(invoice.total_cents, invoice.currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="grid gap-1 type-caption text-ink-muted">
          {seller.tax_note ? <p>{seller.tax_note}</p> : null}
          <p>Paid online through Razorpay. Amounts in {invoice.currency}.</p>
        </div>
      </article>
    </div>
  );
}
