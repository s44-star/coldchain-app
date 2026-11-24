import { Thermograph } from "@/components/marketing/thermograph";
import { buttonClasses } from "@/components/ui/button";
import { CONTACT_EMAIL, demoMailto } from "@/lib/site";

const capabilities = [
  {
    title: "Live monitoring",
    body: "Every zone shows its current temperature and humidity, its limits and the last 24 hours. A sensor that stops reporting is flagged, never silently ignored.",
  },
  {
    title: "Alerts that end in action",
    body: "A reading outside its limits opens an alert with the value that caused it. Your team acknowledges, assigns and resolves it; serious ones become incidents with photos and corrective actions.",
  },
  {
    title: "Evidence on request",
    body: "Every change is written to an audit trail that cannot be edited. Export temperature logs, alert history and incident reports per warehouse, in that warehouse’s own time zone.",
  },
  {
    title: "Access by role",
    body: "Owners, admins, warehouse managers, operators and viewers each see and do what their role allows. Managers can be limited to the warehouses they run.",
  },
  {
    title: "Your sensors, your choice",
    body: "Any logger that can send an HTTPS request reports readings with its own device key. Demo data is always labelled as simulated.",
  },
];

const steps = [
  { title: "Map your sites", body: "Add warehouses and their storage zones, and set the temperature and humidity limits for each." },
  { title: "Connect sensors", body: "Register each logger, issue it a key, and readings start arriving within minutes." },
  { title: "Respond", body: "Alerts reach the people responsible. Every acknowledgement and fix is timestamped." },
  { title: "Prove it", body: "Hand inspectors a report for any zone and period, backed by the full audit trail." },
];

export default function HomePage() {
  return (
    <>
      <section aria-labelledby="hero-title" className="mx-auto w-full max-w-[1200px] px-6 pt-10 pb-16 md:px-10 md:pt-20">
        <h1 id="hero-title" className="type-display max-w-[14ch] text-ink">
          Every degree, on record.
        </h1>
        <p className="mt-6 max-w-[38rem] type-lead text-ink-muted">
          ColdChain OS watches every zone in your cold-storage warehouses, raises an alert the moment a reading leaves
          its limits, and keeps the evidence your auditors ask for.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={demoMailto} className={buttonClasses({ size: "lg" })}>
            Book a demo
          </a>
          <a href="#how-it-works" className={buttonClasses({ variant: "secondary", size: "lg" })}>
            See how it works
          </a>
        </div>

        <div className="mt-16 md:mt-20">
          <Thermograph />
        </div>
      </section>

      <section aria-labelledby="covers-title" className="border-t border-line">
        <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-6 py-20 md:grid-cols-12 md:px-10 md:py-28">
          <h2 id="covers-title" className="type-title text-ink md:sticky md:top-10 md:col-span-5 md:self-start">
            One record for every zone, from the first reading to the audit.
          </h2>
          <dl className="md:col-span-7">
            {capabilities.map((item) => (
              <div key={item.title} className="grid gap-2 border-t border-line py-7 first:border-t-0 first:pt-0">
                <dt className="type-h2 text-ink">{item.title}</dt>
                <dd className="max-w-[34rem] type-body text-ink-muted">{item.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-6 border-t border-line">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-20 md:px-10 md:py-28">
          <h2 id="how-title" className="type-title max-w-[22ch] text-ink">
            From first sensor to first inspection in four steps.
          </h2>
          <ol className="relative mt-14 grid gap-10 md:grid-cols-4 md:gap-8">
            {/* The band line that connects the steps on wide screens */}
            <span aria-hidden="true" className="absolute top-[1.15rem] right-0 left-0 hidden border-t border-dashed border-line-strong md:block" />
            {steps.map((step, index) => (
              <li key={step.title} className="relative grid content-start gap-3">
                <span className="relative grid size-9 place-items-center rounded-full border border-primary bg-canvas type-small font-semibold tabular text-primary">
                  {index + 1}
                </span>
                <h3 className="type-h2 text-ink">{step.title}</h3>
                <p className="type-body text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="contact" aria-labelledby="contact-title" className="scroll-mt-6 border-t border-line">
        <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-6 py-20 md:grid-cols-12 md:items-end md:px-10 md:py-28">
          <div className="md:col-span-7">
            <h2 id="contact-title" className="type-title text-ink">
              Start with one warehouse.
            </h2>
            <p className="mt-4 max-w-[34rem] type-lead text-ink-muted">
              We set up ColdChain OS on one site with you, connect the sensors you already have, and agree the limits
              for each zone.
            </p>
          </div>
          <div className="md:col-span-5 md:justify-self-end">
            <a href={demoMailto} className={buttonClasses({ size: "lg" })}>
              Email {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
