import type { Metadata } from "next";
import { buttonClasses } from "@/components/ui/button";
import { LegalPage } from "@/components/marketing/legal-page";
import { CONTACT_EMAIL, demoMailto } from "@/lib/site";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <LegalPage title="Contact" updated="27 November 2026">
      <p>ColdChain OS is built and operated by <strong>LexConv</strong>, India.</p>
      <ul>
        <li>
          Sales, demos and onboarding: <a href={demoMailto}>{CONTACT_EMAIL}</a>
        </li>
        <li>
          Support and billing: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, with your company name
        </li>
        <li>We answer within one working day.</li>
      </ul>
      <div>
        <a href={demoMailto} className={buttonClasses({ size: "lg" })}>
          E-mail us
        </a>
      </div>
    </LegalPage>
  );
}
