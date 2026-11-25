import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Panel, PanelBody } from "@/components/ui/panel";
import { getAppContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/roles";
import { CompanyForm } from "./form";

export const metadata: Metadata = { title: "Company" };

export default async function CompanyPage() {
  const ctx = await getAppContext();
  const { data: c } = await ctx.supabase.from("companies").select("*").eq("id", ctx.company.companyId).single();
  if (!c) throw new Error("Company not found");

  return (
    <>
      <PageHeader title="Company" description="These details appear on your invoices and reports." />
      <Panel>
        <PanelBody className="py-6">
          <CompanyForm
            readOnly={!can.editCompany(ctx.role)}
            initial={{
              name: c.name,
              countryCode: c.country_code,
              vatNumber: c.vat_number ?? "",
              registrationNumber: c.registration_number ?? "",
              billingEmail: c.billing_email ?? "",
              addressLine1: c.address_line1 ?? "",
              addressLine2: c.address_line2 ?? "",
              city: c.city ?? "",
              postalCode: c.postal_code ?? "",
            }}
          />
        </PanelBody>
      </Panel>
    </>
  );
}
