import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/form-parts";
import { roleLabels } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/form";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { getAppContext } from "@/lib/auth/context";
import { ASSIGNABLE_ROLES, can } from "@/lib/auth/roles";
import { formatDateTime } from "@/lib/format";
import { changeRole, removeMember, revokeInvitation, transferOwnership } from "./actions";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Team" };

function nowIso(): string {
  return new Date().toISOString();
}

export default async function TeamPage() {
  const ctx = await getAppContext();
  const manage = can.manageTeam(ctx.role);
  const companyId = ctx.company.companyId;

  const { data: members } = await ctx.supabase
    .from("company_members")
    .select("id, user_id, role, created_at")
    .eq("company_id", companyId)
    .order("created_at");
  const { data: profiles } = await ctx.supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", (members ?? []).map((m) => m.user_id));
  const people = new Map((profiles ?? []).map((p) => [p.id, p]));

  const { data: invitations } = manage
    ? await ctx.supabase
        .from("company_invitations")
        .select("id, email, role, expires_at")
        .eq("company_id", companyId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", nowIso())
        .order("created_at", { ascending: false })
    : { data: [] };

  const others = (members ?? []).filter((m) => m.user_id !== ctx.userId);

  return (
    <>
      <PageHeader title="Team" description="Who can see and act on your warehouses." />
      <div className="grid gap-6">
        {manage ? (
          <Panel>
            <PanelHeader title="Invite someone" description="They get a link to create an account and join this company." />
            <PanelBody>
              <InviteForm />
            </PanelBody>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader title="Members" description={`${members?.length ?? 0} people`} />
          <Table caption="Team members">
            <THead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Joined</Th>
                {manage ? <Th className="text-right">Actions</Th> : null}
              </tr>
            </THead>
            <TBody>
              {(members ?? []).map((m) => {
                const person = people.get(m.user_id);
                const editable = manage && m.role !== "owner" && m.user_id !== ctx.userId;
                return (
                  <Tr key={m.id}>
                    <Td>
                      <div className="grid">
                        <span className="font-medium">
                          {person?.full_name || person?.email || "Member"}
                          {m.user_id === ctx.userId ? <span className="text-ink-muted"> (you)</span> : null}
                        </span>
                        <span className="type-caption text-ink-muted">{person?.email}</span>
                      </div>
                    </Td>
                    <Td>
                      {editable ? (
                        <ActionForm action={changeRole} hidden={{ memberId: m.id }}>
                          <label className="sr-only" htmlFor={`role-${m.id}`}>
                            Role for {person?.email}
                          </label>
                          <Select id={`role-${m.id}`} name="role" defaultValue={m.role} className="h-9 w-48">
                            {ASSIGNABLE_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {roleLabels[role]}
                              </option>
                            ))}
                          </Select>
                          <SubmitButton variant="secondary" size="sm" pendingLabel="Saving">
                            Save
                          </SubmitButton>
                        </ActionForm>
                      ) : (
                        <Badge tone={m.role === "owner" ? "primary" : "neutral"}>{roleLabels[m.role]}</Badge>
                      )}
                    </Td>
                    <Td className="tabular text-ink-muted">{formatDateTime(m.created_at).split(",")[0]}</Td>
                    {manage ? (
                      <Td className="text-right">
                        {editable ? (
                          <ActionForm
                            action={removeMember}
                            hidden={{ memberId: m.id }}
                            className="justify-end"
                            confirm={`Remove ${person?.email ?? "this person"} from ${ctx.company.companyName}?`}
                          >
                            <SubmitButton variant="ghost" size="sm" pendingLabel="Removing">
                              Remove
                            </SubmitButton>
                          </ActionForm>
                        ) : null}
                      </Td>
                    ) : null}
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </Panel>

        {manage && invitations?.length ? (
          <Panel>
            <PanelHeader title="Open invitations" description="Not accepted yet." />
            <Table caption="Open invitations">
              <THead>
                <tr>
                  <Th>E-mail</Th>
                  <Th>Role</Th>
                  <Th>Expires</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </THead>
              <TBody>
                {invitations.map((inv) => (
                  <Tr key={inv.id}>
                    <Td>{inv.email}</Td>
                    <Td>{roleLabels[inv.role]}</Td>
                    <Td className="tabular text-ink-muted">{formatDateTime(inv.expires_at)}</Td>
                    <Td className="text-right">
                      <ActionForm action={revokeInvitation} hidden={{ id: inv.id }} className="justify-end">
                        <SubmitButton variant="ghost" size="sm" pendingLabel="Withdrawing">
                          Withdraw
                        </SubmitButton>
                      </ActionForm>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Panel>
        ) : null}

        {can.transferOwnership(ctx.role) && others.length ? (
          <Panel>
            <PanelHeader
              title="Transfer ownership"
              description="The new owner controls billing and can delete the company. You become an admin."
            />
            <PanelBody>
              <ActionForm
                action={transferOwnership}
                hidden={{}}
                confirm="Transfer ownership? You will become an admin and cannot undo this yourself."
              >
                <label className="sr-only" htmlFor="new-owner">
                  New owner
                </label>
                <Select id="new-owner" name="userId" className="w-72" defaultValue="">
                  <option value="" disabled>
                    Choose a member
                  </option>
                  {others.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {people.get(m.user_id)?.full_name || people.get(m.user_id)?.email}
                    </option>
                  ))}
                </Select>
                <SubmitButton variant="danger" pendingLabel="Transferring">
                  Transfer ownership
                </SubmitButton>
              </ActionForm>
            </PanelBody>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
