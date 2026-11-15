# Realtime authorisation and the channel lifecycle

Ticket: [#6](https://github.com/BIGboss248/supabase-nextjs-lab/issues/6).

Verified 2026-11-15. Every snippet is copied from the source named directly above or below it. Blocks marked **composed** are written for this repo from those sources, not quoted.

| Component | Version | Checked via |
|---|---|---|
| `next` | 16.4.6 | `npm view next version` |
| `@supabase/supabase-js` | 2.119.0 | `npm view @supabase/supabase-js version` |
| `@supabase/realtime-js` | 2.119.0 (dependency pin of the above) | `npm view @supabase/supabase-js dependencies` |
| Supabase CLI | 3.1.0 — **not pinned in this repo** (no `package.json` yet) | `npm view supabase version`, `npm view supabase time.modified` → 2026-11-13 |
| Realtime server | `supabase/realtime` `master`, read 2026-11-15 | GitHub raw |
| Postgres | docs `current` = 18.7; local stack defaults to `db.major_version = 15` | postgresql.org |

Primary documents read:

- <https://supabase.com/docs/guides/realtime/postgres-changes>
- <https://supabase.com/docs/guides/realtime/authorization>
- <https://supabase.com/docs/guides/realtime/subscribing-to-database-changes>
- <https://supabase.com/docs/guides/realtime/limits>
- <https://supabase.com/docs/guides/troubleshooting/realtime-postgres-changes-troubleshooting>
- <https://supabase.com/docs/guides/troubleshooting/realtime-heartbeat-messages>
- <https://supabase.com/docs/guides/local-development/cli/config> (Realtime Config section)
- <https://supabase.com/docs/guides/local-development/diff-engines>
- <https://supabase.com/docs/guides/local-development/cli/migrating-to-v3>
- <https://raw.githubusercontent.com/supabase/realtime-js/master/src/RealtimeChannel.ts>
- <https://raw.githubusercontent.com/supabase/realtime-js/master/src/RealtimeClient.ts>
- <https://raw.githubusercontent.com/supabase/realtime/master/ARCHITECTURE.md>
- <https://raw.githubusercontent.com/supabase/realtime/master/README.md>
- <https://www.postgresql.org/docs/current/sql-altertable.html#SQL-ALTERTABLE-REPLICA-IDENTITY>

---

## 1. Publication: how a table joins `supabase_realtime`

Three surfaces exist. Only one is a durable artifact in a local-first workflow.

| Surface | Exists? | Captured by `db diff`? | Portable? |
|---|---|---|---|
| Dashboard toggle (hosted or local Studio → Database → Publications) | yes | it changes the DB, so yes if diffed immediately | no — click-ops, invisible in review |
| `supabase/config.toml` | **no setting exists** | n/a | n/a |
| `alter publication supabase_realtime add table ...` in a migration | yes | yes (pg-delta) | yes |

The CLI config reference has only two keys under `[realtime]` — `realtime.enabled` (default `true`) and `realtime.ip_version` (default `"IPv6"`). There is no publication key. `config.toml` can start or stop the Realtime container; it cannot put a table into a publication.

Source: <https://supabase.com/docs/guides/local-development/cli/config> (Realtime Config), read 2026-11-15 against CLI 3.1.0.

The docs' own instruction, verbatim (<https://supabase.com/docs/guides/realtime/postgres-changes>):

```sql
alter publication supabase_realtime
add table your_table_name;
```

That is the canonical statement. The bare form is not idempotent: re-running it fails with `relation "products" is already member of publication "supabase_realtime"`. A migration must survive `supabase db reset` and a shadow-database diff, so guard it. **Composed** for this repo:

```sql
-- supabase/migrations/<timestamp>_products_realtime.sql
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end
$$;
```

Membership is a property of the table object: dropping and recreating `products` silently drops it from the publication, and Realtime goes quiet for that table. The migration must run after the `create table`.

### Which is authoritative here

The migration. Reasons, in order of weight:

1. `supabase start` / `db reset` replay migrations only. A dashboard toggle on the local stack is destroyed by `supabase stop --no-backup` and never reaches CI or a hosted project.
2. It is reviewable. The plan's Phase 2 Verify step ("`supabase db diff` is clean after committing the migration") only holds if the publication change is in SQL.
3. The hosted project in Phase 7 receives this through `db push`, with no second manual step.

### Does `supabase db diff` capture it?

Yes on the default engine, and that is a recent change worth knowing.

- CLI v3 makes `pg-delta` the default diff engine for every project. The diff-engine page lists what pg-delta models that migra missed: "comments, domains, roles, publication membership, and the security invoker setting on views".
- Legacy `migra` is the engine that "silently omitted" untracked objects. The same page, in its migration steps, says a history "built from legacy diffs … doesn't mention objects the legacy engine didn't track, such as comments, domains, roles, and publication membership".

Sources: <https://supabase.com/docs/guides/local-development/diff-engines>, <https://supabase.com/docs/guides/local-development/cli/migrating-to-v3> ("pg-delta is the default schema diff engine").

So: author the statement in the migration, and use `supabase db diff` as the check that it landed. On the migra engine — the v2 default, still selectable in v3 with `--use-migra` — expect the publication membership to be invisible to the diff. One more reason not to derive it from the diff.

Unverified: whether this project's eventual CLI pin will be v3 or `v2.stable`. Nothing in the repo pins it yet. The statement above works on both engines regardless, which is the point.

Two adjacent facts the docs state, both worth knowing before debugging:

- Realtime reads the publication, not the table: "Realtime doesn't watch every table by default. Each one has to be added to a publication called `supabase_realtime`. If it isn't, Realtime has no visibility into that table at all — no matter how the client subscription is set up." Check with `select * from pg_publication_tables where pubname = 'supabase_realtime';`
- Whether `supabase start` pre-creates `supabase_realtime` in a fresh local project is **unverified** here (no local stack in this repo yet). The guarded block above covers both cases.

---

## 2. RLS interaction with `postgres_changes`

### What Realtime actually does per event

From the server's own architecture document (<https://raw.githubusercontent.com/supabase/realtime/master/ARCHITECTURE.md>), Postgres Changes section:

> Every subscription is stored alongside the JWT the client presented when it joined. When a change comes off the WAL, Realtime doesn't hand it to the subscriber directly. It first asks the tenant's own database whether that specific client would have been allowed to read that specific row, using the client's identity and role. Only rows that come back visible are delivered, and columns the client's role can't select are stripped out of the payload before it leaves the database. So Postgres Changes never grants a client more access than a plain select would: the table's own row-level security policies are the thing being evaluated, not a copy of them maintained by Realtime. The one gap is deletes, where the row no longer exists to be checked, so subscribers get only its primary key.

That is the whole model, and it settles the three sub-questions:

- **Invisible rows produce no event at all.** Not a redacted event, not an empty payload, not an error. Delivery is the filter.
- **Columns the subscriber's role lacks `SELECT` on are stripped** from `new`/`old`. This is column privileges, separate from RLS.
- **The check is per subscriber, per event.** The scaling page quantifies it: "When you make a single change to a table with 100 subscribed users, Realtime performs 100 authorization checks — one per user — so throughput scales with the number of subscribers, not the write rate."

Cross-checked against the Realtime Authorization page (<https://supabase.com/docs/guides/realtime/authorization>), which covers both features in one sentence: "When using Postgres Changes on tables with RLS, database records are sent only to clients who are allowed to read them based on your RLS policies. Private and public channels can subscribe to Postgres Changes."

Note the last clause. `postgres_changes` does **not** need `private: true` and does **not** consult `realtime.messages` policies. Those govern `broadcast` and `presence` only. Only the `products` table's own policies matter here.

### The policy an anonymous listing page needs

Rows in `products` are public if `published`. The policy is a plain `select` policy for both client roles:

```sql
grant select on public.products to anon, authenticated;

alter table public.products enable row level security;

create policy "published products are public"
on public.products
for select
to anon, authenticated
using (published = true);
```

**Composed** from the quick-start pattern in <https://supabase.com/docs/guides/realtime/postgres-changes>, which does exactly this shape (`grant select … to anon` + `enable row level security` + `for select to anon using (true)`).

There is no Realtime-specific policy to write. The `select` policy that makes the listing page work over PostgREST is the policy that makes Realtime deliver its `UPDATE` events. One policy, two consumers. If the page renders and realtime stays silent, that is a publication or identity problem, not a second policy you forgot.

### Do `anon` subscribers receive `UPDATE` events on publicly readable rows?

Yes. The subscriber's role is whatever its JWT says — the publishable/anon key with no session yields `anon`. The authorization check is a read performed as that role. If `using (published = true)` passes, the event is delivered — and on `UPDATE` the policy has to allow both the old and the new row state, per the article quoted next.

One consequence for `sellOneUnit`, from the troubleshooting article (<https://supabase.com/docs/guides/troubleshooting/realtime-postgres-changes-troubleshooting>):

> One trap specific to `UPDATE` events: RLS generally has to allow both the old and new row state. If a policy only permits `status = 'active'`, and an update flips the status to `archived`, the event can fail to deliver — the row was visible a second ago, but the new state no longer passes the check.

So an update that flips `published` to `false` delivers no event, and the page keeps showing a row it can no longer read. That is another argument for refetch-on-reconnect and for treating the stream as a hint rather than the truth. Do not add a `filter: 'published=eq.true'` to "fix" this; it hides the transition rather than handling it (and the docs do not state whether the filter is evaluated before or after the change — **unverified**).

The same article also states what `SUBSCRIBED` does and does not mean:

> `SUBSCRIBED` only means the WebSocket connected. It says nothing about whether that client is allowed to see the data.

And it names the failure mode the plan's Phase 2 note predicted:

> This is the most common cause, and it's the one that wastes the most time, because nothing errors. The event doesn't show up.

### What a subscriber sees for rows it cannot read

Nothing — with one gap that is a documented security caveat rather than a bug:

- The main docs carry a caution under *Receiving `old` records*: "RLS policies are not applied to `DELETE` statements, because there is no way for Postgres to verify that a user has access to a deleted record."
- The architecture doc's "one gap is deletes" sentence says subscribers get the primary key.

Read together: a `DELETE` event can name a row the subscriber could not have `SELECT`ed. Treat the `old` key of a delete event as untrusted. For this repo it is harmless (`products` has no delete path in v1), but it is the reason not to enable `replica identity full` on a policy-protected table that holds anything non-public. Whether Realtime filters `DELETE` events by RLS at all is **unverified**; the docs say the check is impossible, not that it is skipped selectively.

---

## 3. Channel lifecycle in a React 19 / Next 16 client component

### Where the effect belongs

In a Client Component (`'use client'`), in `useEffect`, in the one component that owns reconciliation. Not in a Server Component (no effects), not at module scope of a file that the server also imports (the browser client is a singleton per tab, but a module-scope subscription would fire on import, before hydration, and would never be cleaned up).

The listing page stays a Server Component; the subscriber is a leaf client component rendered beside the grid, which calls a callback or writes to a small client store when a row changes. The intent is to keep the port boundary intact: the component receives a `ProductCatalog`-shaped callback, not a Supabase client. (Signatures are ticket #3 and #7's business; this note only fixes the lifecycle.)

### The pattern

Copied from Step 5 of <https://supabase.com/docs/guides/troubleshooting/realtime-postgres-changes-troubleshooting>:

```js
useEffect(() => {
  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      (payload) => console.log(payload.new)
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [roomId])
```

Three properties matter, and they are not stylistic:

1. **The channel is created inside the effect**, so each run owns exactly one instance. A channel held in `useRef` survives the Strict Mode cleanup and is re-subscribed into a dead object.
2. **The cleanup is the exact inverse of the setup**, synchronously. Do not `await` anything before returning the cleanup.
3. **`removeChannel`, not `unsubscribe`** — see below.

### Why Strict Mode does not produce duplicate subscriptions

React 19 Strict Mode in development mounts, runs the effect, runs the cleanup, then runs the effect again. With the pattern above the second run creates a *new* channel, so the count returns to one. The trap is the missing cleanup: `supabase.channel(topic)` is deduplicated by topic, so the second run returns the *same joined instance* and `.on(...)` appends a second binding — one change, two callback invocations.

Source evidence for the dedupe, `RealtimeClient.channel()` (<https://raw.githubusercontent.com/supabase/realtime-js/master/src/RealtimeClient.ts>):

```ts
channel(
  topic: string,
  params: RealtimeChannelOptions = { config: {} }
): RealtimeChannel {
  const realtimeTopic = `realtime:${topic}`
  const exists = this.getChannels().find(
    (c: RealtimeChannel) => c.topic === realtimeTopic
  )

  if (!exists) {
    const chan = new RealtimeChannel(`realtime:${topic}`, params, this)
    this.channels.push(chan)

    return chan
  } else {
    return exists
  }
}
```

There is a second, subtler hazard, and it does **not** bite in Strict Mode. `subscribe()` only joins a channel whose state is `closed` — this is the guard clause, verbatim:

```ts
if (this.state == CHANNEL_STATES.closed) {
```

`unsubscribe()` sets `state = leaving` synchronously and only reaches `closed` when the leave is acknowledged (or short-circuited by `if (!this._canPush())`). If a cleanup ran after the join had completed, a re-created channel of the same topic could still be `leaving`, and `subscribe()` would silently no-op. In Strict Mode the mount effect and its cleanup run in the same synchronous task, before any WebSocket frame can be processed, so the channel is always still `joining` and `_canPush()` is false — the leave resolves immediately. The race becomes real only if the effect awaits before returning its cleanup. Hence rule 2.

Verified against `RealtimeChannel.ts` (`subscribe`, `unsubscribe`, `_canPush`) at the version above. The Strict Mode conclusion is derived from that source, not from a doc statement.

### `removeChannel` vs `unsubscribe`

Both are public API; they are not the same call. From `RealtimeClient.ts`:

```ts
async removeChannel(
  channel: RealtimeChannel
): Promise<RealtimeRemoveChannelResponse> {
  const status = await channel.unsubscribe()

  if (this.channels.length === 0) {
    this.disconnect()
  }

  return status
}
```

And from `RealtimeChannel.ts`, the JSDoc on `unsubscribe`, complete:

```ts
  /**
   * Leaves the channel.
   *
   * Unsubscribes from server events, and instructs channel to terminate on server.
   * Triggers onClose() hooks.
   *
   * To receive leave acknowledgements, use the a `receive` hook to bind to the server ack, ie:
   * channel.unsubscribe().receive("ok", () => alert("left!") )
   */
```

That last line is stale: the shipped `unsubscribe` returns `Promise<'ok' | 'timed out' | 'error'>`, not a push object, so `.receive(...)` does not exist. Trust the signature, not the comment.

So: `unsubscribe()` leaves the topic and lets the channel close, leaving the WebSocket open. `removeChannel()` does that plus disconnects the socket when it was the last channel on the client. The reference page's one-line description of `removeChannel` is "Unsubscribes, removes and tears down a single channel" (<https://supabase.com/docs/reference/javascript/removechannel>).

Use `removeChannel` in cleanup. It is what the troubleshooting guide prescribes, and it means a component that unmounts last does not leave a socket idling until the no-channels timeout.

Worth flagging rather than hiding: Supabase's own troubleshooting articles disagree. The *too many channels* article uses `channel.unsubscribe()` in its "correct" example (<https://supabase.com/docs/kb/troubleshooting/realtime-too-many-channels-error>), while the *postgres changes* article uses `supabase.removeChannel(channel)`. Both stop delivery; only the second closes the socket. Prefer the second.

### Other lifecycle facts that constrain the design

- One channel can carry several `.on('postgres_changes', …)` bindings; a separate channel per table is a choice, not a requirement. Limit is 100 channels per connection (<https://supabase.com/docs/guides/realtime/limits>).
- The channel name may be any string **except** `'realtime'` — stated on the postgres-changes page, repeated for every language.
- `subscribe()` takes a status callback whose values are `SUBSCRIBED`, `TIMED_OUT`, `CLOSED`, `CHANNEL_ERROR` (`REALTIME_SUBSCRIBE_STATES` in `RealtimeChannel.ts`). The reference page adds: "Log the full `err` so its `cause`, `name`, and any structured fields aren't hidden behind `err.message`." A channel stuck in `CHANNEL_ERROR` and a channel that joins but never fires are different bugs; log the status before debugging anything else.
- A confirmed timing gap exists between `SUBSCRIBED` and the backend actually streaming. The documented workaround (flagged there as "not formally documented yet") is a `system` binding:

```js
supabase
  .channel('room1')
  .on('system', '*', (payload) => {
    if (payload.extension === 'postgres_changes' && payload.status === 'ok') {
      console.log('changes are ready', payload) // safe to write now
    }
  })
  .on('postgres_changes', { event: '*', schema: '*' }, (payload) => {
    console.log('Change received!', payload)
  })
  .subscribe()
```

Relevant to Phase 6's E2E: an action that writes immediately after mount can be missed. Read the list after the write rather than asserting on the event.

---

## 4. Event shape and `REPLICA IDENTITY`

### Types, verbatim from `RealtimeChannel.ts`

```ts
type RealtimePostgresChangesPayloadBase = {
  schema: string
  table: string
  commit_timestamp: string
  errors: string[]
}

export type RealtimePostgresInsertPayload<T extends { [key: string]: any }> =
  RealtimePostgresChangesPayloadBase & {
    eventType: `${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT}`
    new: T
    old: {}
  }

export type RealtimePostgresUpdatePayload<T extends { [key: string]: any }> =
  RealtimePostgresChangesPayloadBase & {
    eventType: `${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.UPDATE}`
    new: T
    old: Partial<T>
  }

export type RealtimePostgresDeletePayload<T extends { [key: string]: any }> =
  RealtimePostgresChangesPayloadBase & {
    eventType: `${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.DELETE}`
    new: {}
    old: Partial<T>
  }
```

So an `UPDATE` callback receives `{ schema, table, commit_timestamp, eventType: 'UPDATE', new, old, errors }`. Note `eventType`, not `type`; the client renames the wire field while enriching the payload (`_trigger` in the same file). `errors` is an array and is empty on the happy path — read it before trusting `new`.

`old` is typed `Partial<T>` for a reason. It is not a copy of the previous row by default.

### How `REPLICA IDENTITY` decides what `old` contains

Postgres semantics (<https://www.postgresql.org/docs/current/sql-altertable.html#SQL-ALTERTABLE-REPLICA-IDENTITY>):

- `DEFAULT` — "Records the old values of the columns of the primary key. This is the default for non-system tables. When there is no primary key, the behavior is the same as `NOTHING`."
- `USING INDEX` — the columns of a unique, non-partial, non-deferrable, `NOT NULL` index.
- `FULL` — "Records the old values of all columns in the row."
- `NOTHING` — no old row at all.

And the sentence that explains most "only some columns arrived" reports, on the same page:

> In most cases, the old value of each column is only logged if it differs from the new value; however, if the old value is stored externally, it is always logged regardless of whether it changed.

Set it explicitly in the migration:

```sql
alter table public.products replica identity full;
```

**Composed** from the docs' form (`alter table messages replica identity full;`). Do not add it to this repo yet — see the contradiction below.

### The contradiction you must not paper over

Three sources, three claims about `old`:

| Source | Claim |
|---|---|
| Postgres docs | `DEFAULT` logs PK columns; `FULL` logs all columns |
| Realtime docs, *Receiving `old` records* | "By default, only `new` record changes are sent but if you want to receive the `old` record … set the `replica identity` of your table to `full`" |
| Troubleshooting article, Step 3 | "By default, Postgres only sends the primary key in the 'old row' for `UPDATE` and `DELETE`." Then: "If the table has Row Level Security enabled, `replica identity full` isn't enough by itself: the `old` record still contains only the primary key. There's no way around this while RLS is on — don't rely on other `payload.old` fields for a policy-protected table." |

The third claim is the operating one, and it contradicts the second. `products` will have RLS on. Therefore: **`replica identity full` buys nothing on `products`**, and `payload.old` will carry the primary key only. The mechanism behind the RLS restriction is not documented and was **not reproduced** here — treat the claim as documented-but-unverified, and design so that being wrong is harmless.

The practical rule: never compute a delta from `old` vs `new`. Reconcile from `new` alone, keyed by `id`. If a feature genuinely needs the previous value, that value must be stored on the row (an `updated_at`, a previous-stock column, or an audit table) rather than recovered from the event.

### Handling partial payloads

Three independent ways a payload can be narrower than the row:

1. `old` holds only the identity columns (above).
2. Under `FULL`, Postgres logs an unchanged column's old value only when it is stored externally (TOAST), so `old` is still a delta for ordinary columns.
3. The payload limit truncates fields: "When this limit is reached, the `new` and `old` record payloads only include the fields with a value size of less than or equal to 64 bytes." (<https://supabase.com/docs/guides/realtime/limits>, Postgres changes payload limit — 1,024 KB on every plan.)

The handler therefore merges, never replaces, and tolerates absence:

```ts
// Composed. Reconcile by id; do not assume every column is present.
if (payload.errors.length > 0) return

const patch = payload.new as Pick<Product, 'id' | 'stock'>
if (typeof patch.id !== 'string') return

setProducts((prev) => prev.map((p) => (p.id === patch.id ? { ...p, ...patch } : p)))
```

A `{ ...row, ...patch }` spread is safe for a missing column and silently wrong for a deliberate `null`. For v1's `stock` (a non-null integer) that is acceptable; the moment a nullable column enters the payload, the merge needs presence checks rather than truthiness.

Ordering is the other loose end. Events are not ordered across a reconnect, so two updates to the same row can arrive as `4` then `5` and leave the badge on the older value until something else corrects it. For a stock counter that is a visible but self-healing error. If it is not acceptable, compare `payload.commit_timestamp` against the last applied value for that `id` and ignore older patches, or skip the merge and refetch the row on each event — the row is the source of truth either way.

Also: a row arriving via `new` has not been re-serialised by the adapter's Zod schema. If the port boundary validates, validate here too, or accept that realtime writes bypass the boundary the rest of the app respects. This is the unresolved part of ticket #7's surface; flagging it rather than deciding it.

---

## 5. Reconnection, sleep, and silent loss

### What the server admits

From the Realtime README (<https://raw.githubusercontent.com/supabase/realtime/master/README.md>):

> The server does not guarantee that every message will be delivered to your clients so keep that in mind as you're using Realtime.

The troubleshooting article says the same operationally:

> One thing to design around regardless: Realtime doesn't guarantee every message gets delivered. Network blips and reconnects can drop an event here and there. If a missed update matters, treat the Realtime event as a signal to re-fetch state — not as the only source of truth. Then a dropped event is an inconvenience, not a bug.

There is no replay for `postgres_changes`. Broadcast has replay retention (72 hours, `broadcast` section of the limits page); Postgres Changes has no equivalent. A gap in the socket is a gap in your data, permanently.

### What the client does

From `RealtimeClient.ts`, verbatim:

```ts
const CONNECTION_TIMEOUTS = {
  HEARTBEAT_INTERVAL: 25000,
  RECONNECT_DELAY: 10,
  HEARTBEAT_TIMEOUT_FALLBACK: 100,
} as const

const RECONNECT_INTERVALS = [1000, 2000, 5000, 10000] as const
const DEFAULT_RECONNECT_FALLBACK = 10000
```

- Heartbeat every 25 s. If a heartbeat goes unanswered, the client logs `heartbeat timeout. Attempting to re-establish connection`, closes the socket itself, and schedules a reconnect (`sendHeartbeat`).
- Reconnect backoff is stepped, not exponential: 1 s, 2 s, 5 s, 10 s, then 10 s forever.
- On close, `_triggerChanError()` fires `CHANNEL_ERROR` on every channel; on reconnect the channels rejoin (`rejoinTimer` / `_rejoinUntilConnected`) and each `postgres_changes` binding is re-registered in the join payload. Subscriptions survive a reconnect; the events during the gap do not.
- Manual `disconnect()` suppresses reconnection (`_wasManualDisconnect`).

### Laptop sleep and backgrounded tabs

The heartbeat is a `setInterval` in the page. A sleeping laptop or a throttled background tab stops running it, so the socket dies without the client noticing; on wake the timer fires late, or the socket is already half-open. Supabase's guidance is to move the heartbeat off the main thread rather than lengthen the interval (<https://supabase.com/docs/guides/troubleshooting/realtime-heartbeat-messages>):

```js
const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: {
    worker: true
  }
});
```

With `worker: true`, heartbeats originate from a Web Worker, which browsers throttle far less aggressively than a background tab's main thread. `heartbeatCallback` / `realtime.onHeartbeat(status)` receives `sent | ok | error | timeout | disconnected`, so a UI can show "reconnecting" instead of lying.

### The mitigation

Treat the stream as an invalidation signal, not a data source:

1. **Refetch on every `SUBSCRIBED`**, including rejoins. It is idempotent, it closes the sleep gap, and it costs one query. This is the single mechanism that makes "sleeping the tab and returning does not leave a stale list" (Phase 6 Verify) true.
2. **Merge events by `id`** between refetches (section 4).
3. **Never** reconstruct authoritative state from an event log you did not persist. Realtime is not a log.

A generation counter is not needed for v1: refetching on `SUBSCRIBED` already covers reconnect, so the handler only has to be right about each individual patch. Ordering is the one thing it is not right about — see section 4.

For this repo specifically, reads are uncached by default — `supabase-js` never opts into Next's cache, and Cache Components make caching opt-in (locked decision #4). A refetch after reconnect is therefore a plain `select` through the port: nothing to invalidate, no revalidation step, and no risk that the refetch returns the same stale entry the event was meant to correct.

---

## 6. When `broadcast` or `presence` beats `postgres_changes`

**Broadcast.** Better when one write fans out to many subscribers — the docs quantify the crossover at roughly 3,000 concurrent subscribers on the same change, because "Broadcast sends each change once and fans it out to all subscribers" while Postgres Changes runs one RLS check per subscriber per event. It is also better when the message is not a row (a computed aggregate, a "deal ended" signal) or when the payload must be shaped differently per audience; the cost is a trigger, a private channel, and `realtime.messages` policies instead of the table's own.

**Presence.** Better when the question is "who is here right now" rather than "what changed" — an ephemeral, per-client state that must vanish when a tab closes and must not be persisted. Nothing in a product listing is presence; it would be the wrong tool even for a "3 people viewing" badge, since that count is a derived aggregate and belongs in Broadcast or a query.

`postgres_changes` remains right for this repo: one table, a handful of subscribers, and the RLS-on-the-table model means no second policy system to learn or maintain.

---

## What this changes in the plan

- Phase 2's Build list is right ("`products` added to the `supabase_realtime` publication") but the artifact must be the guarded migration above, not a Studio toggle. Its Verify bullet "`supabase db diff` is clean" only proves something on a pg-delta era CLI.
- Phase 2's Record note — "Realtime authorises against RLS per subscriber — a policy mistake shows up as silence, not an error" — is confirmed by three independent primary sources.
- Phase 6's Verify bullet "Sleeping the tab and returning does not leave a stale list" cannot pass without refetch-on-`SUBSCRIBED`. Subscribing alone will not do it.
- Phase 6's Build bullet "subscribes to `UPDATE` on `products.stock`" is correct but incomplete: the handler must merge `payload.new` by `id`, must not read `payload.old`, and must tolerate a truncated or absent column.
- Open for ticket #7: whether the realtime patch re-enters the `ProductCatalog` boundary or bypasses it. This note deliberately does not decide it.

## Unverified

- Whether the local stack pre-creates the `supabase_realtime` publication.
- The mechanism (not the existence) of the "RLS on ⇒ `old` is PK-only even with `replica identity full`" claim.
- Whether Realtime applies RLS filtering to `DELETE` events at all, and thus how far a delete event's `old.id` leaks.
- Whether a `filter` on a `postgres_changes` subscription is evaluated against the new row, the old row, or both.
- That a reconnect can reorder events, and that `postgres_changes` has no replay of any kind. Both follow from the "no delivery guarantee" statement plus the absence of a replay option for this feature, but neither is stated in those words; the mitigation does not depend on either answer.
- The pinned Supabase CLI version for this repo (nothing pins it yet).
