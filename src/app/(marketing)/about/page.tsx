import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "About us" };

export default function AboutPage() {
  return (
    <LegalPage title="About us" updated="26 November 2026">
      <p>
        ColdChain OS is software for cold storages, pharmaceutical and food warehouses. It records temperature and humidity from
        sensors every few minutes, raises an alert the moment a chamber goes outside its limits, and keeps the records that food
        safety and drug regulators ask for during inspections.
      </p>
      <h2>Who we are</h2>
      <p>
        ColdChain OS is built and operated by <strong>LexConv</strong>, founded by Subham Praharaj. LexConv serves customers in
        India from India and customers in other countries from the United Kingdom.
      </p>
      <h2>What customers get</h2>
      <ul>
        <li>Live monitoring of every warehouse, zone and sensor</li>
        <li>Alerts by e-mail and in the app, with acknowledgement and resolution recorded</li>
        <li>Incident records with photos and documents</li>
        <li>Maintenance schedules and inspections</li>
        <li>Temperature reports as CSV and PDF, and an audit trail that cannot be edited</li>
      </ul>
      <h2>Talk to us</h2>
      <p>
        E-mail <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or see{" "}
        <Link href="/pricing">pricing</Link> and <Link href="/contact">contact details</Link>.
      </p>
    </LegalPage>
  );
}
