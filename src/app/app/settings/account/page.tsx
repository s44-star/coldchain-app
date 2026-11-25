import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { getAppContext } from "@/lib/auth/context";
import { PasswordForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const ctx = await getAppContext();
  return (
    <>
      <PageHeader title="Your account" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Details" />
          <PanelBody>
            <ProfileForm
              email={ctx.email}
              fullName={ctx.profile?.full_name ?? ""}
              phone={ctx.profile?.phone ?? ""}
            />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Password" />
          <PanelBody>
            <PasswordForm />
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
