#!/usr/bin/env python3
"""
Generate src/types/database.ts from a database that has the migrations applied
(the throw-away test database built by supabase/tests/run.sh).

Output follows the shape of `supabase gen types typescript`, so the typed
Supabase client works the same way. Once the Supabase CLI is available you can
switch to `npm run db:types` against the real project; the result is equivalent.

Usage:  PGDATABASE=coldchain_test python3 scripts/gen-db-types.py > src/types/database.ts
"""
import json
import subprocess
import sys

QUERY = r"""
with
enums as (
  select t.typname as name, json_agg(e.enumlabel order by e.enumsortorder) as values
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
  group by t.typname
),
cols as (
  select c.relname as table_name,
         json_agg(json_build_object(
           'name', a.attname,
           'type', format_type(a.atttypid, a.atttypmod),
           'udt', bt.typname,
           'is_array', bt.typcategory = 'A',
           'elem', et.typname,
           'nullable', not a.attnotnull,
           'has_default', a.atthasdef,
           'identity', a.attidentity,
           'generated', a.attgenerated
         ) order by a.attnum) as columns
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  join pg_type bt on bt.oid = a.atttypid
  left join pg_type et on et.oid = bt.typelem and bt.typcategory = 'A'
  where n.nspname = 'public' and c.relkind = 'r'
  group by c.relname
),
fks as (
  select src.relname as table_name,
         json_agg(json_build_object(
           'name', con.conname,
           'columns', (select json_agg(a.attname order by k.ord)
                       from unnest(con.conkey) with ordinality k(attnum, ord)
                       join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum),
           'ref_table', ref.relname,
           'ref_columns', (select json_agg(a.attname order by k.ord)
                           from unnest(con.confkey) with ordinality k(attnum, ord)
                           join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum),
           'one_to_one', exists (
             select 1 from pg_constraint u
             where u.conrelid = con.conrelid and u.contype in ('p', 'u')
               and (select array_agg(x order by x) from unnest(u.conkey) x)
                 = (select array_agg(x order by x) from unnest(con.conkey) x)
           )
         ) order by con.conname) as relationships
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid
  join pg_namespace sn on sn.oid = src.relnamespace
  join pg_class ref on ref.oid = con.confrelid
  join pg_namespace rn on rn.oid = ref.relnamespace
  where con.contype = 'f' and sn.nspname = 'public' and rn.nspname = 'public'
  group by src.relname
),
funcs as (
  select p.proname as name,
         json_build_object(
           'args', coalesce((
             select json_agg(json_build_object(
               'name', p.proargnames[i + 1],
               'udt', t.typname,
               'is_array', t.typcategory = 'A',
               'elem', et.typname,
               'has_default', i >= p.pronargs - p.pronargdefaults
             ) order by i)
             -- proargtypes is an oidvector, indexed from 0
             from generate_subscripts(p.proargtypes::oid[], 1) as i
             join pg_type t on t.oid = (p.proargtypes::oid[])[i]
             left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
           ), '[]'::json),
           'returns_set', p.proretset,
           'return_udt', rt.typname,
           'table_columns', (
             select json_agg(json_build_object('name', p.proargnames[i], 'udt', t.typname) order by i)
             from generate_subscripts(p.proallargtypes, 1) as i
             join pg_type t on t.oid = p.proallargtypes[i]
             where p.proargmodes[i] = 't'
           )
         ) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_type rt on rt.oid = p.prorettype
  where n.nspname = 'public' and p.prokind = 'f' and rt.typname <> 'trigger'
)
select json_build_object(
  'enums', coalesce((select json_object_agg(name, values) from enums), '{}'::json),
  'tables', coalesce((select json_object_agg(table_name, columns) from cols), '{}'::json),
  'fks', coalesce((select json_object_agg(table_name, relationships) from fks), '{}'::json),
  'funcs', coalesce((select json_object_agg(name, def) from funcs), '{}'::json)
);
"""

STRING_TYPES = {"uuid", "text", "varchar", "bpchar", "citext", "inet", "timestamptz", "timestamp",
                "date", "time", "timetz", "interval", "bytea", "name"}
NUMBER_TYPES = {"int2", "int4", "int8", "numeric", "float4", "float8", "oid"}


def ts_type(udt, is_array=False, elem=None, enums=None):
    if is_array:
        return f"{ts_type(elem, enums=enums)}[]"
    if udt in enums:
        return f'Database["public"]["Enums"]["{udt}"]'
    if udt in STRING_TYPES:
        return "string"
    if udt in NUMBER_TYPES:
        return "number"
    if udt == "bool":
        return "boolean"
    if udt in ("json", "jsonb"):
        return "Json"
    if udt == "void":
        return "undefined"
    return "unknown"


def main():
    raw = subprocess.check_output(["psql", "-X", "-q", "-t", "-A", "-c", QUERY], text=True)
    meta = json.loads(raw)
    enums = meta["enums"]
    out = []
    w = out.append

    w("// Generated by scripts/gen-db-types.py from supabase/migrations. Do not edit by hand.")
    w("// Regenerate: npm run db:types:local  (after supabase/tests/run.sh)")
    w("")
    w("export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];")
    w("")
    w("export type Database = {")
    w("  public: {")
    w("    Tables: {")
    for table in sorted(meta["tables"]):
        columns = meta["tables"][table]
        w(f"      {table}: {{")
        w("        Row: {")
        for c in columns:
            t = ts_type(c["udt"], c["is_array"], c["elem"], enums)
            w(f"          {c['name']}: {t}{' | null' if c['nullable'] else ''};")
        w("        };")
        for mode in ("Insert", "Update"):
            w(f"        {mode}: {{")
            for c in columns:
                t = ts_type(c["udt"], c["is_array"], c["elem"], enums)
                if c["identity"] == "a" or c["generated"] == "s":
                    w(f"          {c['name']}?: never;")
                    continue
                optional = mode == "Update" or c["nullable"] or c["has_default"] or c["identity"] == "d"
                w(f"          {c['name']}{'?' if optional else ''}: {t}{' | null' if c['nullable'] else ''};")
            w("        };")
        rels = meta["fks"].get(table, [])
        if not rels:
            w("        Relationships: [];")
        else:
            w("        Relationships: [")
            for r in rels:
                w("          {")
                w(f'            foreignKeyName: "{r["name"]}";')
                w(f"            columns: {json.dumps(r['columns'])};")
                w(f"            isOneToOne: {'true' if r['one_to_one'] else 'false'};")
                w(f'            referencedRelation: "{r["ref_table"]}";')
                w(f"            referencedColumns: {json.dumps(r['ref_columns'])};")
                w("          },")
            w("        ];")
        w("      };")
    w("    };")
    w("    Views: {")
    w("      [_ in never]: never;")
    w("    };")
    w("    Functions: {")
    for name in sorted(meta["funcs"]):
        f = meta["funcs"][name]
        w(f"      {name}: {{")
        if f["args"]:
            w("        Args: {")
            for a in f["args"]:
                t = ts_type(a["udt"], a["is_array"], a["elem"], enums)
                w(f"          {a['name']}{'?' if a['has_default'] else ''}: {t};")
            w("        };")
        else:
            w("        Args: Record<PropertyKey, never>;")
        if f["table_columns"]:
            w("        Returns: {")
            for c in f["table_columns"]:
                w(f"          {c['name']}: {ts_type(c['udt'], enums=enums)};")
            w("        }[];")
        else:
            rt = ts_type(f["return_udt"], enums=enums)
            w(f"        Returns: {rt}{'[]' if f['returns_set'] else ''};")
        w("      };")
    w("    };")
    w("    Enums: {")
    for name in sorted(enums):
        w(f"      {name}: {' | '.join(json.dumps(v) for v in enums[name])};")
    w("    };")
    w("    CompositeTypes: {")
    w("      [_ in never]: never;")
    w("    };")
    w("  };")
    w("};")
    w("")
    w('type PublicSchema = Database["public"];')
    w("")
    w('export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];')
    w('export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];')
    w('export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];')
    w('export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];')
    w("")
    w("export const Constants = {")
    w("  public: {")
    w("    Enums: {")
    for name in sorted(enums):
        w(f"      {name}: {json.dumps(enums[name])},")
    w("    },")
    w("  },")
    w("} as const;")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
