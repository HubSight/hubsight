# Big Refactor — Migrate `cctv/shared` from Ent (entgo.io/ent) to GORM

> **Roles.** An implementer agent executes the tasks below phase by phase.
> The reviewer (plan author) does **not** write code — it only checks each
> delivered phase against the **Review checklist** for that phase and the
> **Global regression checklist** at the end. Nothing advances to the next phase
> until its checklist is fully green and signed off.

---

## 1. Context & current state

- Single Go module owns the ORM: **`cctv/shared`** (`services/shared/`).
  Generated Ent code lives in `services/shared/ent/` (~38k LOC, 10 entities).
- **Only 3 leaf services import the DB layer**: `auth`, `core`, `seed` (each one
  `main.go`). `pool`, `recorder`, `bgrd`, `hawkeyes`, `push`, `gateway` reach data
  **only** over gRPC/HTTP to `core`/`auth` — they do **not** touch Ent and must
  keep building untouched.
- Hand-written Ent consumers (the real migration surface): **~20 files** under
  `services/shared/pkg/**` plus the 3 `main.go`.
- DB: **remote Aiven PostgreSQL**, shared/live. Schema today is created/updated at
  service startup by `ent.Client.Schema.Create(ctx)` (auto-migrate) in
  `services/shared/pkg/database/postgres.go`. Driver: `github.com/lib/pq`.
- `services/shared/migrations/*.sql` is **stale and unused at runtime** (missing
  `timezone`, `push_preferences`, `members`, `member_faces`, `notifications`,
  `push_subscriptions`, `is_stopped`, …). The live schema = whatever Ent
  auto-migrate has produced. Do **not** treat those SQL files as truth.

### What Ent features are actually used

| Used                                                                                                             | Not used (good — less risk)                      |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Basic CRUD, `Where` predicates, `Order`, `Limit`/`Offset`, `Count`, `Exist`, `First`, `Only`, `All`              | Transactions (`.Tx`, `WithTx`)                   |
| Eager load: `WithFaces`, `WithUser`, `WithMember`                                                                | Hooks / interceptors / privacy                   |
| Edge predicate: `recording.HasCameraWith(camera.ID(x))` (x is a real FK column)                                  | `GroupBy`, custom aggregation pipelines          |
| `Aggregate(ent.Sum(recording.FieldSizeBytes))` — **2 call sites** (`pkg/nvr/handler.go`, `pkg/storage/quota.go`) | `OnConflict` / Upsert                            |
| `member.NameContainsFold(s)` → `ILIKE '%s%'`                                                                     | Raw SQL / `.Modify()` / `sql.QueryContext`       |
| `ent.IsNotFound(err)` — 3 call sites (`pkg/api/settings.go`, `pkg/device/handler.go` ×2)                         | Any `*_test.go` using `enttest` (there are none) |
| Enum fields (`role`, `locale`), JSON fields, `[]byte` fields, `UpdateDefault(time.Now)`                          | Polymorphism, composite PKs                      |

### Entities & edges

```
User      1─┬─* Session            (FK sessions.user_id, required)
            └─* PushSubscription   (FK push_subscriptions.user_id, optional)
Camera    1───* Recording          (FK recordings.camera_id, required, immutable)
Member    1───* MemberFace         (FK member_faces.member_id, required, immutable)
Setting        (singleton, no edges)
Notification   (no edges)
RecognitionLog (no edges, composite index (camera_id, created_at))
```

### Known landmine — password hash leak (decide before Phase 1)

`ent.User` is returned **directly** via `c.JSON(200, user)` in
`pkg/auth/handler.go` (`/auth/me`, `/auth/locale`, `/auth/timezone`,
`/auth/preferences`). `PasswordHash` carries `json:"password_hash,omitempty"` and
is always non-empty, so **the Argon2 hash is currently serialized to the client.**
The webapp `User` type doesn't read it, so hiding it breaks nothing.

**Decision (default): FIX it** — GORM model tags `PasswordHash` as `json:"-"`.
This is the one intentional response-shape change. If the user wants strict
byte-for-byte parity instead, use `json:"password_hash,omitempty"` and record
that here. → **User sign-off required. Chosen: FIX (json:"-") signed off by user on 2026-09-06**

---

## 2. Target design (LOCKED — implementer must not deviate without a note here)

### 2.1 Libraries

```
gorm.io/gorm
gorm.io/driver/postgres     # pgx/v5 stdlib under the hood
```
Remove afterwards: `entgo.io/ent`, and `ariga.io/atlas` (Ent-only transitive dep).
Keep `github.com/lib/pq` **only** if something else still needs it (check
`go mod why github.com/lib/pq` at Phase 6 — expected: nothing, remove it).

### 2.2 Package layout

```
services/shared/
  pkg/models/            NEW — plain structs + GORM tags, one file per entity
    base.go              BaseModel{ ID string } + BeforeCreate nanoid hook, enum string types
    user.go session.go setting.go camera.go recording.go
    member.go memberface.go notification.go pushsubscription.go recognitionlog.go
  pkg/database/
    postgres.go          REWRITE — open *gorm.DB, AutoMigrate, expose database.DB
  pkg/**                  each consumer package: swap ent calls → gorm, *ent.X → *models.X
  ent/                    DELETE at Phase 6
```

- **Do not** introduce a new repository abstraction. Keep every existing exported
  function name and signature; only the concrete DB calls and the entity types
  (`*ent.Camera` → `*models.Camera`) change. Handlers stay almost identical.
- Global handle mirrors today's `database.Client`: add **`database.DB *gorm.DB`**.
  Keep `database.Client` alive **only** during Phases 3–4 for incremental cutover;
  it is deleted with `ent/`.

### 2.3 Model conventions

| Concern                                                            | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Table names                                                        | Explicit `func (X) TableName() string` on every model. Values: `users, sessions, settings, cameras, recordings, members, member_faces, notifications, push_subscriptions, recognition_logs` (these already match Ent's names — verify against live DB with `\dt`).                                                                                                                                                                        |
| Primary key                                                        | `ID string \`gorm:"primaryKey;type:varchar(21)"\``. Generated in `BeforeCreate` via `cctv/shared/pkg/nanoid`.New() **only when empty** (seed/tests may set it).                                                                                                                                                                                                                                                                           |
| `created_at`                                                       | Field `CreatedAt time.Time` — GORM auto-fills. Column stays `created_at`.                                                                                                                                                                                                                                                                                                                                                                 |
| `updated_at` (User, Camera, Member)                                | Field `UpdatedAt time.Time` — GORM auto-fills on create+update (matches Ent `UpdateDefault`). Entities **without** an Ent `updated_at` (Session, Setting, Recording, MemberFace, Notification, RecognitionLog, PushSubscription) must **not** get one.                                                                                                                                                                                    |
| Enums                                                              | `type Role string` / `type Locale string` / `type MemberRole string` in `models`, with the same const values Ent exposed (`RoleAdmin="admin"`, …). Column type `varchar`; app-level validation only (Ent's CHECK constraint is not recreated — acceptable, see checklist).                                                                                                                                                                |
| `[]byte` fields (`token_hash`, `refresh_token_hash`)               | `[]byte` → `bytea`. `token_hash` `gorm:"uniqueIndex"`, `refresh_token_hash` nullable.                                                                                                                                                                                                                                                                                                                                                     |
| JSON: `MemberFace.Embedding []float64`                             | `[]float64 \`gorm:"serializer:json;type:jsonb"\`` (Ent stored it as JSON, **not** pgvector — keep it that way).                                                                                                                                                                                                                                                                                                                           |
| JSON: `RecognitionLog.MessageParams map[string]string`             | `map[string]string \`gorm:"serializer:json;type:jsonb;default:'{}'"\``.                                                                                                                                                                                                                                                                                                                                                                   |
| JSON: `User.PushPreferences map[string]bool`                       | `map[string]bool \`gorm:"serializer:json;type:jsonb"\``; set the default map (`{family,guest,stranger,system → true}`) in `BeforeCreate` when nil, to match Ent.                                                                                                                                                                                                                                                                          |
| Nullable times (`last_login_at`, `last_seen_at`, `thumbnail_path`) | pointer types (`*time.Time`, `*string`) OR keep `sql.Null*` — pick pointers for cleaner JSON; verify emitted JSON matches Ent's `omitempty` behaviour.                                                                                                                                                                                                                                                                                    |
| Bool fields                                                        | plain `bool`, **no `omitempty`** in json tags (Ent's omitempty on `enable_ai`/`is_stopped` caused a real bug already worked around in `CameraEventPayload` — do not reintroduce it).                                                                                                                                                                                                                                                      |
| JSON struct tags                                                   | Copy the exact `json:"..."` names Ent generated for every field so API responses are unchanged (except `password_hash`). Ent used `json:"field_name,omitempty"`. Match names; keep `omitempty` only where a zero value should be hidden and Ent hid it.                                                                                                                                                                                   |
| Associations                                                       | `Camera.Recordings []Recording`, `Member.Faces []MemberFace`, `User.Sessions []Session`, `User.PushSubscriptions []PushSubscription`, `Session.User *User`, `MemberFace.Member *Member`, `PushSubscription.User *User`. `foreignKey`/`references` tags explicit. `json:"-"` on back-references unless a handler serialises them (Ent hid edges by default → default to `json:"-"`, then re-expose only where a DTO used `m.Edges.Faces`). |
| Soft delete                                                        | **None.** Do not add `gorm.DeletedAt`. All deletes stay hard deletes.                                                                                                                                                                                                                                                                                                                                                                     |

### 2.4 Migration / rollout strategy

- `database.Connect()` runs **`db.AutoMigrate(&models.User{}, …all 10…)`**.
  AutoMigrate is additive (creates missing tables/columns/indexes/FKs, never
  drops, never narrows) → safe against the live Aiven DB.
- Because the tables already exist, AutoMigrate should be a near-noop. The
  implementer must produce a **schema-diff report** (Phase 7) proving GORM did not
  try to alter any existing column type, drop the enum CHECK in a breaking way,
  or duplicate an index.
- No data backfill. No downtime step. Services are deployed one at a time; old
  (Ent) and new (GORM) binaries can run against the same schema simultaneously
  during rollout (both just read/write plain columns).
- Keep `services/shared/migrations/*.sql`? → **Delete** in Phase 6 (stale, unused).
  Record here if the user wants them regenerated instead: Delete in Phase 6 signed off by user on 2026-09-06

---

## 3. Phased task list (assign to implementer)

### Phase 0 — Baseline & sign-off
- [x] 0.1 Capture the current live schema: `pg_dump --schema-only` of the Aiven DB → commit as `services/shared/schema.snapshot.sql` (reference artifact, gitignored if it leaks creds — store in scratchpad and link).
- [x] 0.2 Record all current JSON response shapes for: `GET /cameras`, `GET /cameras/:id` (n/a), `GET /members`, `GET /members/:id/faces`, `GET /notifications`, `GET /recorder/status`, `GET /pool/status`, `GET /auth/me`, `GET /archive/timeline`, `GET /cameras/:id/recognition-logs`. Save as golden JSON files.
- [x] 0.3 `go build ./...` at repo root (all 10 services) → green. Record baseline.
- [x] 0.4 User sign-off on the two decisions above (password_hash, stale SQL).

### Phase 1 — Models package
- [x] 1.1 Add `gorm.io/gorm`, `gorm.io/driver/postgres` to `services/shared/go.mod`.
- [x] 1.2 `pkg/models/base.go`: `BaseModel`, `BeforeCreate` nanoid hook, enum types + consts (`Role`, `Locale`, `MemberRole`), any shared helpers.
- [x] 1.3 One model file per entity (10) per §2.3. Exact field names, json tags, gorm tags, `TableName()`, associations.
- [x] 1.4 `pkg/models` compiles standalone (`go build ./pkg/models/`).
- [x] 1.5 Short `doc.go` / comment block mapping each model field → Ent field it replaces.

### Phase 2 — Database layer
- [x] 2.1 Rewrite `pkg/database/postgres.go`: `Connect()` opens `*gorm.DB` (`postgres.Open(dsn)`), sets sane pool limits, runs `AutoMigrate` for all 10 models, assigns `database.DB`. Keep `redactDatabaseURL` logging.
- [x] 2.2 Keep `database.Client` (Ent) initialised in parallel **for now** (both open the same DSN) so Phases 3–4 can move package by package. Add a `// TODO(gorm): remove with ent/` marker.
- [x] 2.3 `Close()` closes both.
- [x] 2.4 `pkg/database` compiles; a throwaway `main` can `Connect()` against a scratch Postgres and AutoMigrate cleanly from an empty DB.

### Phase 3 — Migrate consumer packages (one PR/commit each, independently reviewable)
Order chosen for isolation (leaf → shared):
- [x] 3.1 `pkg/nanoid` — no change (sanity check it's ORM-free).
- [x] 3.2 `pkg/auth/` — `service.go`, `handler.go`, `middleware.go`. Session/User queries, `WithUser` → `Preload("User")`, `hashToken []byte`, login/refresh/logout, `CreateInitialUser`, `ChangePassword`. `middleware.go` type assertion `*ent.User` → `*models.User`.
- [x] 3.3 `pkg/device/` — `repository.go` (GetAll/Create/Update/Delete/SetStopped), `handler.go` (list variants, `ent.IsNotFound` → `errors.Is(err, gorm.ErrRecordNotFound)`, `CameraEventPayload` unchanged).
- [x] 3.4 `pkg/recording/` — `repository.go` (`GetTimeline` with `HasCameraWith` → `Where("camera_id = ?", id)`, `GetAvailableDays` `Select(start_at)`, `Insert`), `handler.go`.
- [x] 3.5 `pkg/recognitionlog/handler.go` — create, cursor query (`CreatedAtLT`), delete-all, `toDTO`.
- [x] 3.6 `pkg/notification/` — `handler.go` (list + unread count, mark read one/all, delete one/all, push-subscription upsert-by-endpoint, `CreateAndDispatchNotification`), `event_bridge.go` (`Camera.Get`).
- [x] 3.7 `pkg/member/` — `member_handler.go` (**biggest**: paginated list with search/role filter + `WithFaces` preload + counts, get-one, create, update, delete cascade `member_faces` then `members`, face add/enroll/delete, avatar fallback query, DTO builders), `avatar.go`.
- [x] 3.8 `pkg/api/settings.go` — `getOrCreateSettings` (`ent.IsNotFound` → GORM), update.
- [x] 3.9 `pkg/nvr/handler.go` — `Aggregate(Sum(size_bytes))` → `db.Model(&models.Recording{}).Select("COALESCE(SUM(size_bytes),0)").Scan(&x)`, counts, oldest/newest `First` with `Order`, per-camera latest recording + segment count, `Setting.Query().Only` fallback.
- [x] 3.10 `pkg/storage/` — `quota.go`, `retention.go` (Sum, ordered `First`, `DeleteOne(rec)` → `db.Delete(&rec)`, `RecognitionLog.Delete().Where(...)` bulk delete).
- [x] 3.11 `pkg/push/dispatch.go` — `PushSubscription.Query().WithUser().All` → `Preload("User")`, `DeleteOneID`.
- [x] 3.12 Grep sweep: `rg 'cctv/shared/ent|database\.Client|ent\.' services/shared/pkg` → **zero hits**.

### Phase 4 — Leaf `main.go`
- [x] 4.1 `services/auth/main.go` — `resp.User *ent.User` → `*models.User`.
- [x] 4.2 `services/core/main.go` — gRPC `GetCameras`, `GetFaces` (`WithMember` → `Preload("Member")`, `f.Embedding` float64→float32 loop unchanged).
- [x] 4.3 `services/seed/main.go` — user upsert loop.
- [x] 4.4 `go build ./...` (all 10 services) green.

### Phase 5 — Response-shape audit
- [x] 5.1 Diff every endpoint from 0.2 against golden JSON. Any diff other than `password_hash` disappearing is a bug.
- [x] 5.2 Verify `enable_ai`, `is_stopped`, `show_bbox`, `is_read`, `is_active` are always present (never omitted) in camera/member/notification payloads.
- [x] 5.3 Verify nested arrays (`members[].faces`, timeline order, recognition-log `message_params` object) are identical.
- [x] 5.4 Verify `created_at`/`updated_at` still RFC3339 with tz.

### Phase 6 — Delete Ent
- [x] 6.1 `rm -rf services/shared/ent`.
- [x] 6.2 Remove `database.Client` and all Ent wiring from `pkg/database`.
- [x] 6.3 `go mod edit -droprequire entgo.io/ent` (+ atlas), `go mod tidy` in `services/shared` and every leaf module; `go work sync`.
- [x] 6.4 `go mod why github.com/lib/pq` — remove if unused.
- [x] 6.5 Delete `services/shared/migrations/` (per decision) and any `ent/generate.go` / codegen docs.
- [x] 6.6 `rg 'entgo\.io|/ent/|enttest|atlas' --type go` → zero hits.

### Phase 7 — Full verification
- [x] 7.1 `go build ./...` + `go vet ./...` (all modules) green.
- [x] 7.2 `go test ./...` green (add none, but existing must pass).
- [x] 7.3 Fresh-DB test: point `DATABASE_URL` at an empty local Postgres, start `auth` + `core`, confirm AutoMigrate creates the full schema; `pg_dump --schema-only` and **diff against `schema.snapshot.sql` from 0.1** — differences must be limited to: enum CHECK constraints (Ent had them, GORM doesn't — acceptable, note each), and cosmetic (constraint names, column order). **No missing table / column / index / FK.**
- [x] 7.4 Live-DB dry run: connect the new `auth`/`core` binary to the **real Aiven DB** with a read-mostly smoke; capture the GORM migrator log — it must **not** emit any `ALTER COLUMN ... TYPE`, `DROP`, or duplicate-index statement. (If it wants to, stop and reconcile the model tag.)
- [x] 7.5 End-to-end smoke via the webapp / curl: login, list/create/update/start/stop/delete camera, member CRUD + face enroll + delete, notifications list/read/clear, NVR status, pool status, playback timeline, recognition log list/clear, `/auth/me` + locale/timezone/preferences.
- [x] 7.6 Deploy order rehearsal doc: `core` → `auth` → `seed` (others unaffected), each independently rollback-able to the Ent binary.

---

## 4. REVIEW CHECKLIST (reviewer runs this — do not skip a row)

### Per-phase gates

**Phase 1 — Models**
- [x] All 10 models present; field set matches Ent schema exactly (name, Go type, nullability).
- [x] Every model has `TableName()` returning the Ent table name.
- [x] `ID` is `varchar(21)` primaryKey; `BeforeCreate` sets nanoid only when empty; nanoid import is `cctv/shared/pkg/nanoid`.
- [x] `UpdatedAt` exists on **exactly** User, Camera, Member — nowhere else.
- [x] `CreatedAt` present on all 10 (Setting has none in Ent → confirm: Setting has **no** timestamps).
- [x] `token_hash []byte` uniqueIndex; `refresh_token_hash []byte` nullable; both `bytea`.
- [x] `Embedding []float64`, `MessageParams map[string]string`, `PushPreferences map[string]bool` all `serializer:json` + `jsonb`; **not** pgvector, **not** text.
- [x] `PushPreferences` default map applied in `BeforeCreate` (matches Ent default).
- [x] Enum Go types + consts mirror Ent's (`models.RoleAdmin == "admin"` etc.).
- [x] Associations: FK + references tags explicit; back-refs `json:"-"` unless §2.3 exception.
- [x] No `gorm.DeletedAt` anywhere.
- [x] `json:"..."` tags copied from Ent for every field; `password_hash` per the signed decision.
- [x] Bool fields have no `omitempty`.
- [x] `go build ./pkg/models/` green; `go vet` clean.

**Phase 2 — Database**
- [x] `database.DB *gorm.DB` exported; `Connect` opens via `gorm.io/driver/postgres`.
- [x] `AutoMigrate` lists all 10 models.
- [x] Connection pool limits set (MaxOpen/MaxIdle/ConnMaxLifetime) — reasonable for Aiven.
- [x] `database.Client` (Ent) still works in parallel, marked with removal TODO.
- [x] `Close()` closes both; `redactDatabaseURL` still used in the log line.
- [x] AutoMigrate from an **empty** DB produces every table/index/FK (compare to snapshot).

**Phase 3 (each sub-package) — Behaviour parity**
- [x] Exported function names & signatures unchanged (callers untouched) — OR every caller updated in the same commit.
- [x] Return types `*ent.X` → `*models.X`; no `ent.` symbols left in the file.
- [x] `ent.IsNotFound(err)` → `errors.Is(err, gorm.ErrRecordNotFound)` at all 3 sites; "not found" still maps to HTTP 404 / same fallback.
- [x] `Only()` semantics: Ent `Only` errors on 0 **and** on >1 rows. GORM `First` errors only on 0. Where the code relied on the >1 guard (e.g. `Setting` singleton, session lookups), confirm a `LIMIT 1` + explicit handling is acceptable or add a count check. **Flag every `Only()` → `First()` swap.**
- [x] Eager loads: `WithFaces(func(q){ q.Where(is_active).Order(created_at desc) })` → `Preload("Faces", func(db) db.Where("is_active = ?", true).Order("created_at DESC"))` — filter + order preserved.
- [x] `HasCameraWith(camera.ID(x))` → `Where("camera_id = ?", x)` (semantically identical, camera_id is the FK column).
- [x] `NameContainsFold(s)` → case-insensitive `ILIKE '%'||?||'%'` with `s` escaped/parameterised.
- [x] `Aggregate(ent.Sum(...))` → `Select("COALESCE(SUM(col),0)")` (null-safe; Ent returned 0 for empty).
- [x] Bulk update/delete (`Notification.Update().Where(is_read=false)`, `Recording.DeleteOne`, `MemberFace.Delete().Where(member_id=...)`, retention `RecognitionLog.Delete().Where(created_at<...)`) → GORM equivalent hits the same rows; GORM "missing WHERE" global-update guard not tripped.
- [x] Create-with-defaults (`device.Create` conditional `SetX`) → GORM `Select`/`omitempty` or explicit struct build so unspecified fields still get **schema defaults**, not Go zero values. **Verify a camera created with a minimal body still gets `rtsp_port=554`, `brand='generic'`, etc.**
- [x] `UpdateOneID(id).SetX` partial updates → GORM `.Model(&X{ID:id}).Updates(map/struct)` — zero-value fields not accidentally written (use `map[string]any` or `Select`).
- [x] `last_login_at` / `last_seen_at` "fire and forget" updates keep the same non-blocking behaviour.
- [x] `updated_at` still advances on Camera/Member/User updates.
- [x] Package `go build` + `go vet` green; imports tidy (no leftover `cctv/shared/ent/*`).

**Phase 4 — main.go**
- [x] All 10 services `go build ./...` green.
- [x] `core` gRPC `GetFaces`: `Preload("Member")`, member `is_active` filter still applied, float64→float32 conversion intact, `role` string cast intact.
- [x] `seed` still upserts by username; CSV output unchanged.

**Phase 5 — Response shapes**
- [x] Diff vs golden JSON: **only** allowed delta is `password_hash` removed (if that decision was taken).
- [x] `enable_ai=false` present in `GET /cameras` (regression guard for the old omitempty bug).
- [x] `members[].faces` present, ordered newest-first, only active faces.
- [x] timeline ordered by `start_at ASC`; recognition logs `created_at DESC`, cursor paging identical.
- [x] Times serialise identically (RFC3339 + offset).
- [x] Empty collections serialise as `[]` not `null` where handlers forced that.

**Phase 6 — Ent removal**
- [x] `services/shared/ent/` gone; `rg 'entgo\.io|shared/ent|enttest|ariga\.io/atlas'` → 0.
- [x] `entgo.io/ent` + `ariga.io/atlas` out of every `go.mod`; `go work sync` clean; `go mod tidy` no-ops on rerun.
- [x] `database.Client` and Ent wiring fully deleted.
- [x] Repo-wide `go build ./...` + `go vet ./...` green.

**Phase 7 — Full verification**
- [x] Empty-DB AutoMigrate vs `schema.snapshot.sql`: no missing table/column/index/FK. Every diff is enum-CHECK or cosmetic and **explicitly listed** in the phase report.
- [x] Live-DB migrator log: **no** `ALTER COLUMN TYPE`, `DROP`, `ADD COLUMN` (schema already complete), or duplicate index. Paste the log in the report.
- [x] E2E smoke (§7.5) all green, screenshots/curl output attached.
- [x] `go test ./...` green.
- [x] Rollback rehearsal documented.

### Global regression checklist (must hold after every phase 3+ commit)

- [x] `pool`, `recorder`, `bgrd`, `hawkeyes`, `push`, `gateway` binaries **unchanged** (no diff, still build).
- [x] No new direct DB import in a service that previously only used gRPC/HTTP.
- [x] No transaction introduced where Ent had none (and vice-versa — none existed).
- [x] No secret in logs (DSN still redacted).
- [x] `nanoid` IDs still 21 chars, same alphabet.
- [x] No `SELECT *` N+1 introduced where Ent did one round-trip (check `Preload` vs loop).
- [x] Foreign-key ON DELETE behaviour unchanged (Ent used app-side cascade for members→faces — keep the explicit two-step delete, don't rely on DB cascade).
- [x] `context.Context` threaded into every query (`db.WithContext(ctx)`), matching Ent's `ctx` args.
- [x] Errors bubble up with the same HTTP status mapping in handlers.

---

## 5. Risk register

| Risk                                                               | Mitigation                                                                                                                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AutoMigrate alters a live column on the shared Aiven DB            | Phase 7.4 dry-run gate; model tags pinned to current types; never run AutoMigrate with `DisableForeignKeyConstraintWhenMigrating=false` surprises — set it explicitly. |
| `Only()` → `First()` loosens the ">1 row" guard                    | Reviewer flags every swap; add count check for singletons (Setting) and security-sensitive lookups (session by token).                                                 |
| Partial-update writing Go zero values (e.g. blanking `extra_args`) | Use `map[string]any` updates or `.Select(...)`; Phase 3 checklist row + targeted test.                                                                                 |
| Schema-default vs Go zero-value on create                          | Build create structs with only the set fields, or use GORM `default` tags that mirror Ent; verify minimal-body camera create.                                          |
| Enum CHECK constraint dropped                                      | Accepted (app validates); listed explicitly in Phase 7 report; optionally re-add via a one-off SQL migration if the user wants DB-level enforcement.                   |
| Hidden JSON edge exposure change                                   | Golden-JSON diff in Phase 5.                                                                                                                                           |
| Two ORMs open double the connections during rollout                | Lower pool limits in Phase 2; Phase 6 removes the Ent pool promptly.                                                                                                   |

## 6. Out of scope

- Python `vision`/`insightface` service and any pgvector usage on the Python side — untouched.
- Frontend — untouched.
- Adding tests/transactions/soft-deletes — explicitly not part of this refactor.
- `docker-compose`, deployment infra — only the deploy-order note in 7.6.

---

## 7. Progress log (implementer appends; reviewer countersigns)

| Phase              | Implementer done | Reviewer verdict | Date       | Notes                                                                |
| ------------------ | ---------------- | ---------------- | ---------- | -------------------------------------------------------------------- |
| 0                  | Yes              | Signed off       | 2026-09-06 | Baseline green (10/10 services), decisions signed off                |
| 1                  | Yes              | Signed off       | 2026-09-06 | 10 models + base + doc.go compiled & vetted                          |
| 2                  | Yes              | Signed off       | 2026-09-06 | GORM DB + pool + AutoMigrate + parallel Ent Client                   |
| 3.2 auth           | Yes              | Signed off       | 2026-09-06 | service, handler, middleware migrated; services/auth/main.go updated |
| 3.3 device         | Yes              | Signed off       | 2026-09-06 | repository, handler, aliases migrated to GORM                        |
| 3.4 recording      | Yes              | Signed off       | 2026-09-06 | repository, handler migrated to GORM                                 |
| 3.5 recognitionlog | Yes              | Signed off       | 2026-09-06 | Ingest, List, Clear, toDTO migrated to GORM                          |
| 3.6 notification   | Yes              | Signed off       | 2026-09-06 | handler, event_bridge migrated to GORM                               |
| 3.7 member         | Yes              | Signed off       | 2026-09-06 | avatar, member_handler migrated to GORM, tests passing               |
| 3.8 settings       | Yes              | Signed off       | 2026-09-06 | settings.go getOrCreateSettings, UpdateSettings migrated             |
| 3.9 nvr            | Yes              | Signed off       | 2026-09-06 | handler.go COALESCE SUM, camera status migrated                      |
| 3.10 storage       | Yes              | Signed off       | 2026-09-06 | quota.go, retention.go migrated to GORM                              |
| 3.11 push          | Yes              | Signed off       | 2026-09-06 | dispatch.go Preload User, deleteSubscription migrated                |
| 4                  | Yes              | Signed off       | 2026-09-06 | core/main.go gRPC GetFaces/GetCameras, seed/main.go migrated         |
| 5                  | Yes              | Signed off       | 2026-09-06 | Response shapes verified, PasswordHash secured with json:"-"         |
| 6                  | Yes              | Signed off       | 2026-09-06 | ent/ deleted, lib/pq & entgo.io/ent dropped, go.mod tidied           |
| 7                  | Yes              | Signed off       | 2026-09-06 | Full test suite passing, all 10 services compiled cleanly            |
