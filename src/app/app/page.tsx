import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { CheckIcon } from "@/components/icons";
import { buttonClasses } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { getAppContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { LiveZones } from "./live-zones";

export default async function OverviewPage() {
  const ctx = await getAppContext();
  const { count: memberCount } = await ctx.supabase
    .from("company_members")
    .select("id", { count: "exact", head: true })
    .eq("company_id", ctx.company.companyId);

  const firstName = ctx.profile?.full_name?.split(" ")[0];
  const steps = [
    { done: true, title: "Company created", body: ctx.company.companyName },
    {
      done: (memberCount ?? 0) > 1,
      title: "Invite your team",
      body: "Add the people who handle alerts and run the warehouses.",
      href: can.manageTeam(ctx.role) ? "/app/settings/team" : undefined,
      action: "Invite people",
    },
    {
      done: ctx.access.state === "active",
      title: "Choose a plan",
      body: ctx.access.state === "active" ? `${ctx.access.planName} plan` : "Keep access after the free trial.",
      href: can.manageBilling(ctx.role) ? "/app/billing" : undefined,
      action: "See plans",
    },
  ];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome, ${firstName}` : "Welcome"}
        description={`${ctx.company.companyName} on ColdChain OS.`}
      />

      <div className="grid gap-6">
        <Panel>
          <PanelHeader title="Getting started" />
          <PanelBody className="p-0">
            <ol className="divide-y divide-line">
              {steps.map((step) => (
                <li key={step.title} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border text-base",
                      step.done ? "border-ok bg-ok-soft text-ok" : "border-line-strong text-ink-subtle",
                    )}
                    aria-hidden="true"
                  >
                    {step.done ? <CheckIcon /> : null}
                  </span>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="type-small font-semibold text-ink">
                      {step.title}
                      <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
                    </p>
                    <p className="type-small text-ink-muted">{step.body}</p>
                  </div>
                  {!step.done && step.href ? (
                    <Link href={step.href} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      {step.action}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ol>
          </PanelBody>
        </Panel>

        <LiveZones />
      </div>
    </>
  );
}
