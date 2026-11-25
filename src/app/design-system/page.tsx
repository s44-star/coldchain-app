import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { SensorIcon } from "@/components/icons";
import { ZoneReading } from "@/components/monitoring/zone-reading";
import {
  AlertStatusBadge,
  DeliveryStatusBadge,
  IncidentStatusBadge,
  SensorStatusBadge,
  SeverityBadge,
  roleLabels,
} from "@/components/status";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge, SimulatedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/form";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Skeleton, Spinner } from "@/components/ui/spinner";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { formatRange, formatTemperature } from "@/lib/format";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

const swatches = [
  ["canvas", "Page background"],
  ["surface", "Panels and inputs"],
  ["surface-2", "Subtle fills, table headers"],
  ["ink", "Primary text"],
  ["ink-muted", "Secondary text"],
  ["line", "Dividers"],
  ["primary", "Actions, in-range readings"],
  ["ok", "Within limits, resolved"],
  ["warn", "Warnings, acknowledged"],
  ["critical", "Excursions, open alerts"],
  ["info", "Information"],
] as const;

const zones = [
  { name: "Freezer 1", warehouse: "Rotterdam Port Hub", value: -21.4, min: -25, max: -18, sensors: 4, status: "active" as const },
  { name: "Chiller A", warehouse: "Rotterdam Port Hub", value: 9.1, min: 2, max: 8, sensors: 2, status: "active" as const },
  { name: "Dispatch bay", warehouse: "Venlo Fresh", value: null, min: 0, max: 12, sensors: 1, status: "offline" as const },
];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 border-t border-line pt-8">
      <div className="grid gap-1">
        <h2 className="type-h2 text-ink">{title}</h2>
        {description ? <p className="max-w-[60ch] type-small text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default async function DesignSystemPage() {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className="mx-auto grid w-full max-w-[1120px] gap-12 px-6 py-10 md:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-3">
          <Logo />
          <div>
            <h1 className="type-h1 text-ink">Glacier design system</h1>
            <p className="type-small text-ink-muted">Components and tokens used across the ColdChain OS app.</p>
          </div>
        </div>
        <ThemeToggle initial={theme} />
      </header>

      <Section title="Colour" description="Tokens switch with the theme. Status colours are reserved for status; nothing is coloured for decoration.">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {swatches.map(([token, use]) => (
            <li key={token} className="flex items-center gap-3 rounded-panel border border-line bg-surface p-3">
              <span className="size-10 shrink-0 rounded-control border border-line" style={{ background: `var(--${token})` }} />
              <span className="grid">
                <span className="type-small font-medium text-ink">{token}</span>
                <span className="type-caption text-ink-muted">{use}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type" description="Archivo throughout. Its width axis sets hierarchy: wide for headings, normal for text and data.">
        <div className="grid gap-4">
          <p className="type-display text-ink">Every degree</p>
          <p className="type-title text-ink">Section title, 36 px</p>
          <p className="type-h1 text-ink">Page title, 24 px</p>
          <p className="type-h2 text-ink">Panel heading, 21 px</p>
          <p className="type-h3 text-ink">Group heading, 16 px semibold</p>
          <p className="max-w-[65ch] type-body text-ink-muted">
            Body text, 16 px on 1.6. Readings use tabular figures so values line up in columns:{" "}
            <span className="tabular text-ink">{formatTemperature(-21.4)}</span>,{" "}
            <span className="tabular text-ink">{formatTemperature(4.0)}</span>.
          </p>
          <p className="type-reading text-ink">{formatTemperature(-18.6)}</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Save zone</Button>
          <Button variant="secondary">Export CSV</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Archive warehouse</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm" variant="secondary">
            Small
          </Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Forms" description="Labels sit above controls. Errors replace the hint and say how to fix the problem.">
        <div className="grid gap-5 md:grid-cols-2">
          <Field id="ds-zone" label="Zone name" hint="Shown on dashboards and reports." required>
            <Input id="ds-zone" placeholder="Freezer 1" aria-describedby={describedBy("ds-zone", "hint")} />
          </Field>
          <Field id="ds-max" label="Maximum temperature (°C)" error="Maximum must be higher than the minimum (−18 °C).">
            <Input
              id="ds-max"
              inputMode="decimal"
              defaultValue="-25"
              aria-invalid
              aria-describedby={describedBy("ds-max", null, "error")}
            />
          </Field>
          <Field id="ds-type" label="Zone type">
            <Select id="ds-type" defaultValue="freezer">
              <option value="room">Room</option>
              <option value="refrigerated">Refrigerated</option>
              <option value="freezer">Freezer</option>
              <option value="zone">Other zone</option>
            </Select>
          </Field>
          <Field id="ds-notes" label="Corrective action">
            <Textarea id="ds-notes" placeholder="What was done to bring the zone back within limits" />
          </Field>
        </div>
      </Section>

      <Section title="Status" description="One mapping from database state to colour and wording, used everywhere.">
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <SeverityBadge value="critical" />
            <SeverityBadge value="warning" />
            <SeverityBadge value="info" />
          </div>
          <div className="flex flex-wrap gap-2">
            <AlertStatusBadge value="open" />
            <AlertStatusBadge value="acknowledged" />
            <AlertStatusBadge value="resolved" />
            <IncidentStatusBadge value="under_investigation" />
            <IncidentStatusBadge value="closed" />
          </div>
          <div className="flex flex-wrap gap-2">
            <SensorStatusBadge value="active" />
            <SensorStatusBadge value="offline" />
            <SensorStatusBadge value="registered" />
            <DeliveryStatusBadge value="provider_not_configured" />
            <SimulatedBadge />
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.values(roleLabels).map((label) => (
              <Badge key={label}>{label}</Badge>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Messages">
        <div className="grid gap-3 md:grid-cols-2">
          <Callout tone="critical" title="Chiller A is above its limit">
            9.1 °C since 14:35, limit 8 °C. Acknowledge the alert to let your team know someone is on it.
          </Callout>
          <Callout tone="warn" title="Payments pending activation">
            Card payments are not active yet. Contact ceo@lexconv.com to start your subscription.
          </Callout>
          <Callout tone="info" title="E-mail alerts are not set up">
            Alerts appear in the app. E-mail delivery starts once an e-mail provider is configured.
          </Callout>
          <Callout tone="ok" title="Report exported">
            Temperature log for Rotterdam Port Hub, 1–30 November, 8,640 rows.
          </Callout>
        </div>
      </Section>

      <Section title="Monitoring" description="Zone readings show the value against its band. Outside the band, the value and marker turn critical.">
        <div className="grid gap-4 md:grid-cols-3">
          {zones.map((zone) => (
            <ZoneReading
              key={zone.name}
              zoneName={zone.name}
              location={zone.warehouse}
              temperatureC={zone.value}
              humidityPct={zone.value === null ? undefined : 62}
              minC={zone.min}
              maxC={zone.max}
              updatedLabel={zone.value === null ? "47 min ago" : "1 min ago"}
            />
          ))}
        </div>
      </Section>

      <Section title="Table">
        <Panel>
          <PanelHeader title="Zones" description="Rotterdam Port Hub and Venlo Fresh" />
          <Table caption="Storage zones with limits and sensor status">
            <THead>
              <tr>
                <Th>Zone</Th>
                <Th>Warehouse</Th>
                <Th>Limits</Th>
                <Th className="text-right">Sensors</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {zones.map((zone) => (
                <Tr key={zone.name}>
                  <Td className="font-medium">{zone.name}</Td>
                  <Td className="text-ink-muted">{zone.warehouse}</Td>
                  <Td className="tabular">{formatRange(zone.min, zone.max)}</Td>
                  <Td numeric>{zone.sensors}</Td>
                  <Td>
                    <SensorStatusBadge value={zone.status} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Panel>
      </Section>

      <Section title="Empty and loading states">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            icon={<SensorIcon />}
            title="No live hardware connected"
            action={<Button size="sm">Register a sensor</Button>}
          >
            This zone has no sensor reporting yet. Register a sensor and send its first reading to see live data here.
          </EmptyState>
          <Panel>
            <PanelBody className="grid gap-3">
              <div className="flex items-center gap-2 type-small text-ink-muted">
                <Spinner className="size-4" label="Loading readings" /> Loading readings
              </div>
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-4 w-24" />
            </PanelBody>
          </Panel>
        </div>
      </Section>
    </div>
  );
}
