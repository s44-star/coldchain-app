import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="27 November 2026">
      <p>
        This policy explains how <strong>LexConv</strong>, a business registered in India, handles personal data in ColdChain
        OS. For data your
        company enters about its own staff and operations, your company is the controller and we act as its processor. For
        account and billing data, we are the controller. Contact: <a href="mailto:ceo@lexconv.com">ceo@lexconv.com</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> name, work e-mail, optional phone number, password (stored only as a secure hash by our authentication provider).</li>
        <li><strong>Company data:</strong> company name, address, VAT and registration numbers, billing e-mail.</li>
        <li><strong>Operational data:</strong> warehouses, zones, sensor readings, alerts, incidents with photos and documents, maintenance and inspection records.</li>
        <li><strong>Security records:</strong> an audit log of changes, including the user, time and IP address.</li>
        <li><strong>Payment data:</strong> payment status and references. Card details are handled by Razorpay and never reach our servers.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide the service: monitoring, alerts, reports and your team&rsquo;s access (performance of contract).</li>
        <li>To bill and keep invoices (contract and legal obligation).</li>
        <li>To keep the service secure and investigate misuse (legitimate interest).</li>
        <li>To send service e-mails such as alerts, password resets and invitations. We do not send marketing without consent and do not sell data.</li>
      </ul>

      <h2>Where it is stored and who processes it</h2>
      <ul>
        <li><strong>Supabase</strong>: database, authentication and file storage, hosted in the European Union.</li>
        <li><strong>Vercel</strong>: application hosting, with server functions in Frankfurt, Germany.</li>
        <li><strong>Razorpay</strong>: payment processing.</li>
        <li><strong>Resend</strong>: delivery of service e-mails.</li>
      </ul>
      <p>Where a provider processes data outside the European Union, it does so under appropriate safeguards such as standard contractual clauses.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Raw sensor readings: 24 months, after which they may be summarised.</li>
        <li>Account and company data: while the account is open, and deleted within 30 days of closure.</li>
        <li>Invoices and payment records: as long as tax law requires.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask to access, correct, export or delete your personal data, or object to its use, by e-mailing
        <a href="mailto:ceo@lexconv.com"> ceo@lexconv.com</a>. If your company manages your account, we may refer the request to
        it. In India you can escalate to the Data Protection Board under the Digital Personal Data Protection Act, 2023, after
        first contacting us; our grievance contact is the same address. In the EU or UK you can also complain to your national
        data protection authority.
      </p>

      <h2>Cookies</h2>
      <p>
        We use only the cookies needed to keep you signed in and remember your theme and active company. There are no advertising or
        tracking cookies.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit. Each company&rsquo;s data is separated by database access rules, device keys and invitation links
        are stored only as hashes, and every change is recorded in an audit log that cannot be edited.
      </p>
    </LegalPage>
  );
}
