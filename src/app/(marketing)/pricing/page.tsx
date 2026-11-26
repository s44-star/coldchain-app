import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { getPublicEnv } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { demoMailto } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Pricing",
  description: "ColdChain OS plans in Indian rupees and US dollars. 14-day free trial, no card needed.",
};

type Plan = {
  code: string;
  name: string;
  description: string | null;
  currency: string;
  market: string;
  monthly_price_cents: number | null;
  annual_price_cents: number | null;
  setup_fee_cents: number;
  max_warehouses: number | null;
  max_sensors: number | null;
  max_users: number | null;
  features: unknown;
  requires_contact: boolean;
};

function limits(p: Plan): string {
  const part = (n: number | null, one: string, many: string) => (n === null ? `Unlimited ${many}` : `${n} ${n === 1 ? one : many}`);
  return [part(p.max_warehouses, "warehouse", "warehouses"), part(p.max_sensors, "sensor", "sensors"), part(p.max_users, "user", "users")].join(", ");
}

function PlanList({ plans }: { plans: Plan[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {plans.map((p) => (
        <li key={p.code} className="grid content-start gap-4 rounded-panel border border-line bg-surface p-6">
          <div>
            <h3 className="type-h2 text-ink">{p.name}</h3>
            {p.description ? <p className="mt-1 type-small text-ink-muted">{p.description}</p> : null}
          </div>
          {p.requires_contact || p.monthly_price_cents === null ? (
            <p className="type-h2 text-ink">Priced for your sites</p>
          ) : (
            <div className="grid gap-1">
              <p className="tabular text-ink">
                <span className="type-h1">{formatMoney(p.monthly_price_cents, p.currency)}</span>
                <span className="type-small text-ink-muted"> per month</span>
              </p>
              {p.annual_price_cents ? (
                <p className="tabular type-small text-ink-muted">or {formatMoney(p.annual_price_cents, p.currency)} per year</p>
              ) : null}
              {p.setup_fee_cents ? (
                <p className="tabular type-small text-ink-muted">+ {formatMoney(p.setup_fee_cents, p.currency)} one-time setup</p>
              ) : null}
            </div>
          )}
          <p className="type-small text-ink">{limits(p)}</p>
          <ul className="grid gap-1 type-small text-ink-muted">
            {(Array.isArray(p.features) ? p.features : []).filter((f): f is string => typeof f === "string").map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

async function loadPlans(): Promise<Plan[]> {
  if (!getPublicEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_plans")
    .select("code, name, description, currency, market, monthly_price_cents, annual_price_cents, setup_fee_cents, max_warehouses, max_sensors, max_users, features, requires_contact")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order");
  return (data ?? []) as Plan[];
}

export default async function PricingPage() {
  const plans = await loadPlans();
  const india = plans.filter((p) => p.market === "in");
  const global = plans.filter((p) => p.market === "global");

  return (
    <div className="mx-auto grid w-full max-w-[1200px] gap-16 px-6 pt-8 pb-24 md:px-10">
      <header className="grid max-w-[44rem] gap-4">
        <h1 className="type-title text-ink">Pricing</h1>
        <p className="type-body text-ink-muted">
          Every plan starts with a 14-day free trial. No card is needed. Each payment covers one month or one year and nothing
          renews automatically. Cancel by not paying for the next period; see the{" "}
          <Link href="/refunds" className="text-primary underline underline-offset-4">
            refund policy
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/signup" className={buttonClasses({ size: "lg" })}>
            Start free trial
          </Link>
          <a href={demoMailto} className={buttonClasses({ variant: "secondary", size: "lg" })}>
            Talk to us
          </a>
        </div>
      </header>

      {india.length ? (
        <section className="grid gap-6" aria-labelledby="india">
          <div>
            <h2 id="india" className="type-h1 text-ink">
              India
            </h2>
            <p className="mt-1 type-small text-ink-muted">
              Prices in Indian rupees for companies registered in India. Pay by UPI, card or netbanking.
            </p>
          </div>
          <PlanList plans={india} />
        </section>
      ) : null}

      {global.length === 0 && india.length === 0 ? (
        <p className="type-body text-ink-muted">Plans are being updated. E-mail us for current prices.</p>
      ) : null}

      {global.length ? (
      <section className="grid gap-6" aria-labelledby="global">
        <div>
          <h2 id="global" className="type-h1 text-ink">
            Rest of the world
          </h2>
          <p className="mt-1 type-small text-ink-muted">Prices in US dollars. Pay by international card.</p>
        </div>
        <PlanList plans={global} />
      </section>
      ) : null}
    </div>
  );
}
