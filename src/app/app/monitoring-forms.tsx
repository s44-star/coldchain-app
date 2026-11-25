"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/form";
import { SENSOR_TYPES, ZONE_TYPES } from "@/lib/labels";
import type { FormState } from "@/lib/validation";
import { acknowledgeAlert, resolveAlert } from "./alerts/actions";
import { createDeviceKey, registerSensor, simulateReadings, updateSensorZone } from "./sensors/actions";
import { addManualReading, createZone, updateZone } from "./zones/actions";

const init = {} as FormState;

/* ---------------------------------------------------------------- zones -- */

export type ZoneValues = Record<"name" | "type" | "minTemp" | "maxTemp" | "minHumidity" | "maxHumidity" | "interval", string>;
const EMPTY_ZONE: ZoneValues = { name: "", type: "refrigerated", minTemp: "2", maxTemp: "8", minHumidity: "", maxHumidity: "", interval: "5" };

export function ZoneForm({ warehouseId, zoneId, initial }: { warehouseId?: string; zoneId?: string; initial?: ZoneValues }) {
  const [state, action] = useActionState(zoneId ? updateZone : createZone, init);
  const v = { ...EMPTY_ZONE, ...initial, ...(state.ok && !zoneId ? {} : state.values) };
  const e = state.fieldErrors ?? {};
  const num = (name: keyof ZoneValues, label: string, hint?: string) => (
    <Field id={`zone-${name}`} label={label} hint={hint} error={e[name]}>
      <Input
        id={`zone-${name}`}
        name={name}
        inputMode="decimal"
        defaultValue={v[name]}
        aria-invalid={!!e[name]}
        aria-describedby={describedBy(`zone-${name}`, hint, e[name])}
      />
    </Field>
  );

  return (
    <form action={action} className="grid gap-5" noValidate key={state.ok && !zoneId ? state.message : "form"}>
      <FormMessage state={state} />
      {warehouseId ? <input type="hidden" name="warehouseId" value={warehouseId} /> : null}
      {zoneId ? <input type="hidden" name="id" value={zoneId} /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="zone-name" label="Zone name" error={e.name}>
          <Input id="zone-name" name="name" defaultValue={v.name} aria-invalid={!!e.name} aria-describedby={describedBy("zone-name", null, e.name)} />
        </Field>
        <Field id="zone-type" label="Type">
          <Select id="zone-type" name="type" defaultValue={v.type}>
            {Object.entries(ZONE_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {num("minTemp", "Minimum temperature (°C)", "Leave empty for no lower limit.")}
        {num("maxTemp", "Maximum temperature (°C)")}
        {num("minHumidity", "Minimum humidity (%RH)", "Optional.")}
        {num("maxHumidity", "Maximum humidity (%RH)", "Optional.")}
        {num("interval", "Reading every (minutes)", "A sensor is flagged offline after missing two readings.")}
      </div>
      <div>
        <SubmitButton pendingLabel="Saving">{zoneId ? "Save limits" : "Add zone"}</SubmitButton>
      </div>
    </form>
  );
}

export function ManualReadingForm({ zoneId, sensors }: { zoneId: string; sensors: { id: string; name: string }[] }) {
  const [state, action] = useActionState(addManualReading, init);
  const e = state.fieldErrors ?? {};
  if (!sensors.length) return <p className="type-small text-ink-muted">Register a sensor in this zone to record manual readings.</p>;
  return (
    <form action={action} className="grid gap-4" noValidate key={state.ok ? state.message : "form"}>
      <FormMessage state={state} />
      <input type="hidden" name="zoneId" value={zoneId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="mr-sensor" label="Sensor" error={e.sensorId}>
          <Select id="mr-sensor" name="sensorId" defaultValue={state.values?.sensorId ?? sensors[0]?.id}>
            {sensors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="mr-temp" label="Temperature (°C)" error={e.temperature}>
          <Input id="mr-temp" name="temperature" inputMode="decimal" defaultValue={state.values?.temperature} aria-invalid={!!e.temperature} aria-describedby={describedBy("mr-temp", null, e.temperature)} />
        </Field>
        <Field id="mr-hum" label="Humidity (%RH)" error={e.humidity}>
          <Input id="mr-hum" name="humidity" inputMode="decimal" defaultValue={state.values?.humidity} aria-invalid={!!e.humidity} aria-describedby={describedBy("mr-hum", null, e.humidity)} />
        </Field>
      </div>
      <div>
        <SubmitButton variant="secondary" pendingLabel="Recording">
          Record reading now
        </SubmitButton>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- sensors -- */

export function SensorForm({ warehouseId, zones }: { warehouseId: string; zones: { id: string; name: string }[] }) {
  const [state, action] = useActionState(registerSensor, init);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <div className="grid gap-4">
      {state.ok && state.data?.id ? (
        <p role="status" className="rounded-panel border border-ok/30 bg-ok-soft p-4 type-small text-ink">
          {state.message}{" "}
          <Link href={`/app/sensors/${state.data.id}`} className="font-medium text-primary underline underline-offset-4">
            Open sensor
          </Link>
        </p>
      ) : null}
      <form action={action} className="grid gap-5" noValidate key={state.ok ? state.data?.id : "form"}>
        {state.error ? <FormMessage state={state} /> : null}
        <input type="hidden" name="warehouseId" value={warehouseId} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="s-name" label="Sensor name" hint="e.g. Freezer 1 probe A" error={e.name}>
            <Input id="s-name" name="name" defaultValue={v.name} aria-invalid={!!e.name} aria-describedby={describedBy("s-name", "hint", e.name)} />
          </Field>
          <Field id="s-device" label="Device ID or serial number" error={e.externalDeviceId}>
            <Input id="s-device" name="externalDeviceId" autoCapitalize="none" defaultValue={v.externalDeviceId} aria-invalid={!!e.externalDeviceId} aria-describedby={describedBy("s-device", null, e.externalDeviceId)} />
          </Field>
          <Field id="s-type" label="Measures">
            <Select id="s-type" name="type" defaultValue={v.type ?? "temperature_humidity"}>
              {Object.entries(SENSOR_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="s-zone" label="Zone">
            <Select id="s-zone" name="zoneId" defaultValue={v.zoneId ?? zones[0]?.id ?? ""}>
              <option value="">Not placed yet</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="s-maker" label="Manufacturer" hint="Optional.">
            <Input id="s-maker" name="manufacturer" defaultValue={v.manufacturer} aria-describedby="s-maker-hint" />
          </Field>
        </div>
        <div>
          <SubmitButton pendingLabel="Registering">Register sensor</SubmitButton>
        </div>
      </form>
    </div>
  );
}

export function SensorZoneForm({ sensorId, zoneId, zones }: { sensorId: string; zoneId: string | null; zones: { id: string; name: string }[] }) {
  const [state, action] = useActionState(updateSensorZone, init);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={sensorId} />
      <Field id="sz-zone" label="Zone" className="min-w-56 flex-1">
        <Select id="sz-zone" name="zoneId" defaultValue={zoneId ?? ""}>
          <option value="">Not placed</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton variant="secondary" pendingLabel="Saving">
        Move sensor
      </SubmitButton>
      {state.error || state.message ? <div className="w-full"><FormMessage state={state} /></div> : null}
    </form>
  );
}

export function DeviceKeyForm({ sensorId }: { sensorId: string }) {
  const [state, action] = useActionState(createDeviceKey, init);
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-4">
      {state.ok && state.data?.key ? (
        <div role="status" className="grid gap-3 rounded-panel border border-warn/40 bg-warn-soft p-4">
          <p className="type-small font-semibold text-ink">{state.message}</p>
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={state.data.key} aria-label="Device key" className="min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(state.data?.key ?? "");
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy key"}
            </Button>
          </div>
        </div>
      ) : null}
      <form action={action} className="flex flex-wrap items-end gap-3">
        {state.error ? <div className="w-full"><FormMessage state={state} /></div> : null}
        <input type="hidden" name="sensorId" value={sensorId} />
        <Field id="key-name" label="Label" hint="Optional, e.g. where the key is installed." className="min-w-56 flex-1">
          <Input id="key-name" name="name" aria-describedby="key-name-hint" />
        </Field>
        <SubmitButton pendingLabel="Creating">Create device key</SubmitButton>
      </form>
    </div>
  );
}

export function SimulateForm({ sensorId }: { sensorId: string }) {
  const [state, action] = useActionState(simulateReadings, init);
  return (
    <form action={action} className="grid gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="sensorId" value={sensorId} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="mode" value="day" variant="secondary">
          Add 24 hours of simulated readings
        </Button>
        <Button type="submit" name="mode" value="excursion" variant="secondary">
          Simulate an excursion
        </Button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- alerts -- */

export function AlertActions({ alertId, status }: { alertId: string; status: "open" | "acknowledged" | "resolved" }) {
  const [ackState, ack] = useActionState(acknowledgeAlert, init);
  const [resState, resolve] = useActionState(resolveAlert, init);
  const [showResolve, setShowResolve] = useState(false);
  if (status === "resolved") return null;

  return (
    <div className="grid gap-3">
      {ackState.error ? <FormMessage state={ackState} /> : null}
      <div className="flex flex-wrap gap-2">
        {status === "open" ? (
          <form action={ack}>
            <input type="hidden" name="id" value={alertId} />
            <SubmitButton size="sm" pendingLabel="Acknowledging">
              Acknowledge
            </SubmitButton>
          </form>
        ) : null}
        {!showResolve ? (
          <Button size="sm" variant="secondary" onClick={() => setShowResolve(true)}>
            Resolve
          </Button>
        ) : null}
      </div>
      {showResolve ? (
        <form action={resolve} className="grid gap-3">
          <FormMessage state={resState} />
          <input type="hidden" name="id" value={alertId} />
          <Field id={`notes-${alertId}`} label="What was done?" hint="Saved in the alert history and the audit trail.">
            <Textarea id={`notes-${alertId}`} name="notes" rows={3} required aria-describedby={`notes-${alertId}-hint`} />
          </Field>
          <div className="flex gap-2">
            <SubmitButton size="sm" pendingLabel="Resolving">
              Resolve alert
            </SubmitButton>
            <Button size="sm" variant="ghost" onClick={() => setShowResolve(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
