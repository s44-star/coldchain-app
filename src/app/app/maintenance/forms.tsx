"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/form";
import type { FormState } from "@/lib/validation";
import { addEquipment, addSchedule, recordInspection, updateTask } from "./actions";

const init = {} as FormState;
type Wh = { id: string; name: string };
type Zone = { id: string; name: string; warehouseId: string };
type Eq = { id: string; name: string; warehouseId: string };

const CATEGORIES = ["Refrigeration unit", "Compressor", "Evaporator", "Condenser", "Freezer", "Generator", "Dock door", "Other"];

export function EquipmentForm({ warehouses, zones }: { warehouses: Wh[]; zones: Zone[] }) {
  const [state, action] = useActionState(addEquipment, init);
  const v = state.ok ? {} : (state.values ?? {});
  const [wh, setWh] = useState(v.warehouseId ?? warehouses[0]?.id ?? "");
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="eq-name" label="Name" hint="e.g. Freezer 1 compressor" error={e.name}>
          <Input id="eq-name" name="name" defaultValue={v.name} aria-invalid={!!e.name} aria-describedby={describedBy("eq-name", "hint", e.name)} />
        </Field>
        <Field id="eq-cat" label="Type">
          <Select id="eq-cat" name="category" defaultValue={v.category ?? CATEGORIES[0]}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field id="eq-wh" label="Warehouse">
          <Select id="eq-wh" name="warehouseId" value={wh} onChange={(ev) => setWh(ev.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="eq-zone" label="Zone">
          <Select id="eq-zone" name="zoneId" defaultValue="" key={wh}>
            <option value="">Not in a zone</option>
            {zones.filter((z) => z.warehouseId === wh).map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="eq-maker" label="Manufacturer" hint="Optional.">
          <Input id="eq-maker" name="manufacturer" defaultValue={v.manufacturer} aria-describedby="eq-maker-hint" />
        </Field>
        <Field id="eq-serial" label="Serial number" hint="Optional.">
          <Input id="eq-serial" name="serialNumber" defaultValue={v.serialNumber} aria-describedby="eq-serial-hint" />
        </Field>
      </div>
      <div>
        <SubmitButton pendingLabel="Adding">Add equipment</SubmitButton>
      </div>
    </form>
  );
}

export function ScheduleForm({ equipment, warehouses, today }: { equipment: Eq[]; warehouses: Wh[]; today: string }) {
  const [state, action] = useActionState(addSchedule, init);
  const v = state.ok ? {} : (state.values ?? {});
  const e = state.fieldErrors ?? {};
  const whName = new Map(warehouses.map((w) => [w.id, w.name]));
  if (!equipment.length) return <p className="type-small text-ink-muted">Add equipment first.</p>;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sc-eq" label="Equipment" error={e.equipmentId}>
          <Select id="sc-eq" name="equipmentId" defaultValue={v.equipmentId ?? equipment[0]?.id}>
            {equipment.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name} ({whName.get(q.warehouseId)})
              </option>
            ))}
          </Select>
        </Field>
        <Field id="sc-title" label="Task" hint="e.g. Clean condenser coils" error={e.title}>
          <Input id="sc-title" name="title" defaultValue={v.title} aria-invalid={!!e.title} aria-describedby={describedBy("sc-title", "hint", e.title)} />
        </Field>
        <Field id="sc-int" label="Repeat every (days)" error={e.intervalDays}>
          <Input id="sc-int" name="intervalDays" inputMode="numeric" defaultValue={v.intervalDays ?? "30"} aria-invalid={!!e.intervalDays} aria-describedby={describedBy("sc-int", null, e.intervalDays)} />
        </Field>
        <Field id="sc-due" label="First due" error={e.firstDue}>
          <Input id="sc-due" name="firstDue" type="date" defaultValue={v.firstDue ?? today} aria-invalid={!!e.firstDue} aria-describedby={describedBy("sc-due", null, e.firstDue)} />
        </Field>
      </div>
      <div>
        <SubmitButton pendingLabel="Adding">Add schedule</SubmitButton>
      </div>
    </form>
  );
}

export function TaskUpdateForm({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState(updateTask, init);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-end">
      <input type="hidden" name="id" value={id} />
      <Field id={`t-st-${id}`} label="Status">
        <Select id={`t-st-${id}`} name="status" defaultValue={status === "pending" ? "completed" : status}>
          <option value="pending">To do</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Done</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </Field>
      <Field id={`t-n-${id}`} label="Notes">
        <Input id={`t-n-${id}`} name="notes" placeholder="What was done" />
      </Field>
      <SubmitButton size="md" variant="secondary" pendingLabel="Saving">
        Save
      </SubmitButton>
      {state.error ? (
        <p role="alert" className="type-caption text-critical sm:col-span-3">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function InspectionForm({ warehouses, zones, equipment }: { warehouses: Wh[]; zones: Zone[]; equipment: Eq[] }) {
  const [state, action] = useActionState(recordInspection, init);
  const v = state.ok ? {} : (state.values ?? {});
  const [wh, setWh] = useState(v.warehouseId ?? warehouses[0]?.id ?? "");
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="in-wh" label="Warehouse">
          <Select id="in-wh" name="warehouseId" value={wh} onChange={(ev) => setWh(ev.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="in-target" label="Inspected" error={e.target}>
          <Select id="in-target" name="target" key={wh} defaultValue="">
            <option value="" disabled>
              Choose
            </option>
            <optgroup label="Zones">
              {zones.filter((z) => z.warehouseId === wh).map((z) => (
                <option key={z.id} value={`zone:${z.id}`}>
                  {z.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Equipment">
              {equipment.filter((q) => q.warehouseId === wh).map((q) => (
                <option key={q.id} value={`equipment:${q.id}`}>
                  {q.name}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        <Field id="in-res" label="Result">
          <Select id="in-res" name="result" defaultValue={v.result ?? "pass"}>
            <option value="pass">Pass</option>
            <option value="needs_attention">Needs attention</option>
            <option value="fail">Fail</option>
          </Select>
        </Field>
      </div>
      <Field id="in-find" label="Findings" hint="Required unless the result is Pass." error={e.findings}>
        <Textarea id="in-find" name="findings" rows={3} defaultValue={v.findings} aria-invalid={!!e.findings} aria-describedby={describedBy("in-find", "hint", e.findings)} />
      </Field>
      <Field id="in-ca" label="Corrective action">
        <Textarea id="in-ca" name="correctiveAction" rows={2} defaultValue={v.correctiveAction} />
      </Field>
      <div>
        <SubmitButton pendingLabel="Recording">Record inspection</SubmitButton>
      </div>
    </form>
  );
}
