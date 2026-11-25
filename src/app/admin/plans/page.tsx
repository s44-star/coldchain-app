import { PageHeader } from "@/components/app/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/form-parts";
import { Field, Input, Select } from "@/components/ui/form";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { updatePlan } from "../actions";

const dollars = (cents: number | null) => (cents === null ? "" : String(cents / 100));

export default async function AdminPlansPage() {
  const { supabase } = await requirePlatformAdmin();
  const { data: plans } = await supabase.from("subscription_plans").select("*").order("sort_order");

  return (
    <>
      <PageHeader title="Plans and prices" description="Prices in US dollars. Changes apply to new payments; paid periods are not affected." />
      <div className="grid gap-6">
        {(plans ?? []).map((p) => (
          <Panel key={p.id}>
            <PanelHeader title={p.name} description={p.requires_contact ? "Contact sales (no self-serve checkout)" : `Code: ${p.code}`} />
            <PanelBody>
              <ActionForm action={updatePlan} hidden={{ id: p.id }} className="grid gap-4">
                <div className="grid w-full gap-4 sm:grid-cols-4">
                  {[
                    ["monthly", "Monthly price ($)", dollars(p.monthly_price_cents)],
                    ["annual", "Yearly price ($)", dollars(p.annual_price_cents)],
                    ["setup", "Setup fee ($)", dollars(p.setup_fee_cents)],
                  ].map(([name, label, value]) => (
                    <Field key={name} id={`${p.id}-${name}`} label={label!}>
                      <Input id={`${p.id}-${name}`} name={name} defaultValue={value} inputMode="decimal" />
                    </Field>
                  ))}
                  <Field id={`${p.id}-active`} label="Available">
                    <Select id={`${p.id}-active`} name="isActive" defaultValue={String(p.is_active)}>
                      <option value="true">Yes</option>
                      <option value="false">Hidden</option>
                    </Select>
                  </Field>
                  {[
                    ["maxWarehouses", "Max warehouses", p.max_warehouses],
                    ["maxZones", "Max zones", p.max_zones],
                    ["maxSensors", "Max sensors", p.max_sensors],
                    ["maxUsers", "Max users", p.max_users],
                  ].map(([name, label, value]) => (
                    <Field key={String(name)} id={`${p.id}-${name}`} label={String(label)} hint="Empty = unlimited">
                      <Input id={`${p.id}-${name}`} name={String(name)} defaultValue={value === null ? "" : String(value)} inputMode="numeric" />
                    </Field>
                  ))}
                </div>
                <SubmitButton pendingLabel="Saving">{`Save ${p.name}`}</SubmitButton>
              </ActionForm>
            </PanelBody>
          </Panel>
        ))}
      </div>
    </>
  );
}
