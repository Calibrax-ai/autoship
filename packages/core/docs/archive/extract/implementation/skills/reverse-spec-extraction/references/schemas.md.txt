# Endpoint and Entity Schemas

Reference schemas for `api-spec.*.json` and `data-model.*.json` artifacts. Consulted during synthesis, not on every probe. The parent SKILL.md carries the information-category rule and calls out when these are load-bearing.

Schemas define the **information categories** each artifact must carry, not exact field names or runtime-specific formats. A Go handler's response type looks different from a Flask handler's — that's fine. What must be present, regardless of runtime, is the information: what method, what path, what location in source, what shapes go in and out, what side effects, what anomalies.

If your output has fewer fields per entry than the example below, you are under-probing. Re-read the source and fill in what's missing. A 6-field endpoint is almost always a thin output, not a simple one.

## Endpoint schema (shared by `api-spec.declared.json`, `api-spec.observed.json`, merged `api-spec.json`)

**Required per endpoint** (per-probe outputs):

| Field | When required | Content |
|---|---|---|
| `method` | always | HTTP verb or streaming kind (`GET`, `POST`, `WEBSOCKET`, `SSE`, …) |
| `path_template` | always | Route pattern using the runtime's native placeholder syntax |
| `source_location` | always | File + line reference traceable back to source (`path/to/file.ext:line`) |
| `handler_name` | always | Function/handler identifier the route resolves to |
| `request_schema` / `declared_request_schema` | methods with body (POST/PUT/PATCH) | Field-by-field shape: names, types, nullability. `null` for GET/DELETE with no body |
| `response_schema` / `declared_response_schema` | always | Field-by-field shape of each response case. Include error cases when the handler branches |
| `side_effects` / `side_effects_inferred` | always | Array of observable effects (DB writes, external calls, file ops). Empty array allowed |
| `notes` | when applicable | Structural mismatches, low-confidence flags, anomalies. Omit when there's nothing to note |

**Merged-artifact additions** (`api-spec.json`):

| Field | Content |
|---|---|
| `presence` | `declared` \| `observed` \| `both` |
| `schema_agreement` | `match` \| `drift` \| `declared-only` \| `observed-only` (when `presence = both`) |
| `schema_agreement_reason` | Short reason string when `schema_agreement != match` |
| `declared: {...}` | Nested object containing all fields from the declared source for this endpoint |
| `observed: {...}` | Nested object containing all fields from the observed source for this endpoint |

**Example (runtime-neutral — merged endpoint):**

```json
{
  "method": "DELETE",
  "path_template": "/api/v1/users/{id}",
  "presence": "both",
  "source_location": "src/handlers/users.py:142",
  "handler_name": "delete_user",
  "schema_agreement": "drift",
  "schema_agreement_reason": "declared path converter types id as int; DB schema has id as TEXT PRIMARY KEY",
  "declared": {
    "declared_request_schema": null,
    "declared_response_schema": {
      "ok_case": { "ok": "boolean", "deleted": "int" },
      "error_case": { "error": "string" }
    },
    "side_effects_inferred": ["DELETE FROM users WHERE id = ?"],
    "notes": "Path converter type conflicts with column type — low confidence on handler behavior for UUID ids"
  },
  "observed": {
    "status_codes_seen": [200, 404],
    "response_samples": [
      { "case": "ok", "body": { "ok": true, "deleted": 1 } },
      { "case": "not_found", "body": { "error": "not found" } }
    ],
    "side_effects_observed": ["row removed from users table after 200"]
  }
}
```

## Entity schema (shared by `data-model.declared.json`, `data-model.actual.json`, merged `data-model.json`)

**Required per entity** (per-probe outputs):

| Field | When required | Content |
|---|---|---|
| `name` | always | Entity/table identifier as used in source or DB |
| `source` | always (per-probe) | Storage source for this entry (`postgres`, `sqlite`, `csv`, `orm-model`, `declared-only`, etc.) |
| `fields` (or `columns`) | always | Array of `{ name, type, constraints?, nullability?, default? }` |
| `relationships` | when present | Array of `{ kind, target, via, cardinality }` (foreign keys, joins, join tables). Empty when standalone |
| `notes` | when applicable | Structural findings: multi-tenancy pattern, migration drift, duplicate definitions, type anomalies |

**Merged-artifact additions** (`data-model.json`):

| Field | Content |
|---|---|
| `sources` | Array of sources that define this entity (e.g. `["postgres", "orm-model"]`) |
| `authoritative_source` | Chosen source + one-line reason |
| `drift` | Array of `{ source, diff_kind, description }` for per-source divergences |
| `declared: {...}` / `actual: {...}` | Nested per-source objects preserving original field lists |

**Example (runtime-neutral — merged entity):**

```json
{
  "name": "users",
  "sources": ["postgres", "orm-model"],
  "authoritative_source": "postgres",
  "authoritative_source_reason": "Live DB has migrated beyond the ORM model — two columns present in postgres that the model omits.",
  "fields": [
    { "name": "id", "type": "uuid", "constraints": ["primary_key", "not_null"] },
    { "name": "email", "type": "varchar(255)", "constraints": ["unique", "not_null"] },
    { "name": "tenant_id", "type": "uuid", "constraints": ["foreign_key->tenants.id"], "source": "postgres-only" },
    { "name": "last_seen_at", "type": "timestamptz", "constraints": ["nullable"], "source": "postgres-only" },
    { "name": "created_at", "type": "timestamptz", "constraints": ["not_null", "default:now()"] }
  ],
  "relationships": [
    { "kind": "belongs_to", "target": "tenants", "via": "tenant_id", "cardinality": "many-to-one" }
  ],
  "drift": [
    { "source": "orm-model", "diff_kind": "missing_fields", "description": "ORM model omits tenant_id and last_seen_at present in live DB" }
  ],
  "notes": "Multi-tenant via tenant_id (postgres RLS enforced); ORM model unaware of tenancy."
}
```
