import { describe, expect, it } from "vitest";
import { describeActivity } from "@/lib/activity";

const base = { id: 1, company_id: null, actor_email: "a@b.c", resource_id: "x", created_at: "2026-11-26T10:00:00Z" };

describe("activity log wording", () => {
  it("names created records", () => {
    const r = describeActivity({ ...base, action: "warehouses.created", resource_type: "warehouses", metadata: { record: { name: "Rotterdam DC" } } });
    expect(r.what).toBe("Warehouse added: Rotterdam DC");
  });

  it("lists changed fields and hides bookkeeping columns", () => {
    const r = describeActivity({
      ...base,
      action: "storage_zones.updated",
      resource_type: "storage_zones",
      metadata: { changes: { max_temp_c: { from: -18, to: -20 }, updated_by: { from: "u1", to: "u2" } } },
    });
    expect(r.what).toBe("Zone changed");
    expect(r.details).toBe("max temp (°C): -18 → -20");
  });

  it("copes with unknown tables and empty metadata", () => {
    const r = describeActivity({ ...base, action: "new_things.deleted", resource_type: "new_things", metadata: null });
    expect(r.what).toBe("New things removed");
    expect(r.details).toBe("");
  });
});
