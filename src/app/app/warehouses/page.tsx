import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { getAppContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/roles";
import { countryName } from "@/lib/countries";
import { WAREHOUSE_TYPES } from "@/lib/labels";
import { WarehouseForm } from "./warehouse-form";

export const metadata: Metadata = { title: "Warehouses" };

export default async function WarehousesPage() {
  const ctx = await getAppContext();
  const companyId = ctx.company.companyId;

  const [{ data: warehouses }, { data: zones }, { data: alerts }, { data: company }] = await Promise.all([
    ctx.supabase.from("warehouses").select("id, name, code, type, city, country_code").eq("company_id", companyId).is("archived_at", null).order("name"),
    ctx.supabase.from("storage_zones").select("id, warehouse_id").eq("company_id", companyId).is("archived_at", null),
    ctx.supabase.from("alerts").select("id, warehouse_id").eq("company_id", companyId).neq("status", "resolved"),
    ctx.supabase.from("companies").select("country_code").eq("id", companyId).single(),
  ]);

  const count = (rows: { warehouse_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.warehouse_id === id).length;
  const canCreate = can.editCompany(ctx.role);

  return (
    <>
      <PageHeader title="Warehouses" description="Sites you monitor, with their storage zones and sensors." />
      <div className="grid gap-6">
        {warehouses?.length ? (
          <Panel>
            <Table caption="Warehouses">
              <THead>
                <tr>
                  <Th>Warehouse</Th>
                  <Th>Type</Th>
                  <Th>Location</Th>
                  <Th className="text-right">Zones</Th>
                  <Th>Alerts</Th>
                </tr>
              </THead>
              <TBody>
                {warehouses.map((w) => {
                  const open = count(alerts, w.id);
                  return (
                    <Tr key={w.id}>
                      <Td>
                        <Link href={`/app/warehouses/${w.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                          {w.name}
                        </Link>
                        {w.code ? <span className="ml-2 type-caption text-ink-muted">{w.code}</span> : null}
                      </Td>
                      <Td className="text-ink-muted">{WAREHOUSE_TYPES[w.type]}</Td>
                      <Td className="text-ink-muted">{[w.city, countryName(w.country_code)].filter(Boolean).join(", ")}</Td>
                      <Td numeric>{count(zones, w.id)}</Td>
                      <Td>{open ? <Badge tone="critical" dot>{open} open</Badge> : <Badge tone="ok">None</Badge>}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </Panel>
        ) : (
          <EmptyState title="No warehouses yet">
            {canCreate ? "Add your first site below." : "An owner or admin can add warehouses."}
          </EmptyState>
        )}

        {canCreate ? (
          <Panel>
            <PanelHeader title="Add a warehouse" />
            <PanelBody>
              <WarehouseForm defaultCountry={company?.country_code} />
            </PanelBody>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
