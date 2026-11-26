import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="26 November 2026">
      <p>
        These terms apply to ColdChain OS, an online service for monitoring temperature and humidity in storage facilities,
        provided by <strong>LexConv</strong> (&ldquo;we&rdquo;). Customers in India contract with LexConv in India and pay in
        Indian rupees; all other customers contract with LexConv, United Kingdom, and pay in US dollars. The seller is named on
        every invoice. By creating an account you accept these terms on behalf of the company you register (&ldquo;the
        customer&rdquo;).
      </p>

      <h2>The service</h2>
      <ul>
        <li>ColdChain OS records readings sent by your sensors, compares them with the limits you set, raises alerts, and keeps records for reports and audits.</li>
        <li>It supports your own monitoring procedures; it does not replace them. You remain responsible for the goods you store, for setting correct limits, and for acting on alerts.</li>
        <li>Alerts depend on your sensors, their connection and your team&rsquo;s contact details. We cannot guarantee that every alert reaches every person.</li>
        <li>Readings marked &ldquo;Simulated&rdquo; are demonstration data and are not measurements.</li>
      </ul>

      <h2>Accounts</h2>
      <ul>
        <li>The person who registers the company becomes its owner and controls its users, data and billing.</li>
        <li>Keep passwords and device keys secret. You are responsible for activity under your account and keys.</li>
        <li>You must not attempt to access other customers&rsquo; data, overload the service, or use it for anything unlawful.</li>
      </ul>

      <h2>Trial, plans and payment</h2>
      <ul>
        <li>New companies get a 14-day free trial without a card.</li>
        <li>After the trial, a paid plan is needed to keep using the service. Prices are shown on the billing page: in Indian rupees for companies in India, in US dollars elsewhere.</li>
        <li>Each payment covers one month or one year. The first payment may include a one-time setup fee. Payments are processed by Razorpay.</li>
        <li>Subscriptions do not renew automatically. If a paid period ends, access continues for 3 days and then pauses until payment; your data is kept.</li>
        <li>
          Refunds follow our <Link href="/refunds">refund policy</Link>.
        </li>
      </ul>

      <h2>Your data</h2>
      <ul>
        <li>Data you put into ColdChain OS belongs to you. We process it only to provide the service, as described in our <Link href="/privacy">privacy policy</Link>.</li>
        <li>You can export your records as CSV or PDF at any time.</li>
        <li>If you close your account, we delete your company&rsquo;s data within 30 days, except invoices we must keep by law.</li>
      </ul>

      <h2>Availability and changes</h2>
      <ul>
        <li>We aim to keep the service available at all times but do not promise uninterrupted operation. Planned maintenance is announced in the app where possible.</li>
        <li>We may improve or change features. If a change materially reduces the service you pay for, you may cancel and receive a pro-rata refund for unused full months.</li>
        <li>We may suspend an account that breaks these terms or remains unpaid, after notice where reasonable.</li>
      </ul>

      <h2>Liability</h2>
      <p>
        Nothing in these terms limits liability that cannot be limited by law. Otherwise, our total liability for any claim is limited
        to the amounts you paid us in the 12 months before the claim, and we are not liable for indirect losses, including loss of
        goods, profit or business, arising from use of or inability to use the service.
      </p>

      <h2>Law</h2>
      <p>
        For customers in India these terms are governed by the laws of India and the courts of India have jurisdiction. For all
        other customers they are governed by the laws of England and Wales. Questions:{" "}
        <a href="mailto:ceo@lexconv.com">ceo@lexconv.com</a>.
      </p>
    </LegalPage>
  );
}
