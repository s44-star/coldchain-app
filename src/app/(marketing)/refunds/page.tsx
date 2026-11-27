import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Refund and cancellation policy" };

export default function RefundsPage() {
  return (
    <LegalPage title="Refund and cancellation policy" updated="27 November 2026">
      <h2>Try before you pay</h2>
      <p>Every company starts with a 14-day free trial. No card is needed and nothing is charged automatically.</p>

      <h2>Cancelling</h2>
      <p>
        Payments are for one month or one year at a time and never renew automatically. To cancel, simply do not pay for the next
        period. Your access continues until the end of the period you paid for.
      </p>

      <h2>Refunds</h2>
      <ul>
        <li>
          <strong>First payment:</strong> if you are not satisfied, e-mail us within 14 days of your first payment for a full refund of
          the subscription amount.
        </li>
        <li>
          <strong>Setup fee:</strong> refunded in full if onboarding has not started; not refundable once we have configured your
          warehouses or sensors with you.
        </li>
        <li>
          <strong>Yearly plans:</strong> after the first 14 days, unused full months are refunded pro rata if we materially reduce the
          service or cannot provide it.
        </li>
        <li>Monthly payments after the first are not refundable once the month has started.</li>
      </ul>

      <h2>How refunds are paid</h2>
      <p>
        Approved refunds are made to the original payment method through Razorpay, usually within 5 to 10 working days, in the
        currency you paid (rupees or US dollars).
      </p>

      <h2>Contact</h2>
      <p>
        E-mail <a href="mailto:ceo@lexconv.com">ceo@lexconv.com</a> with your company name and invoice number.
      </p>
    </LegalPage>
  );
}
