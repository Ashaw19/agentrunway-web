-- ============================================================================
-- Migration 00182: AI run ledger (ai_runs, ai_run_writes) and AI undo helpers
--
-- Two ledgers Agent Runway owns, replacing Helicone's cost tracking (the
-- Helicone proxy is removed in the same change):
--
--   ai_runs        one row per model call: feature, model, token and cache
--                  counts, estimated cost, latency, outcome. NO prompt or
--                  completion text, ever: a prompt carries client details.
--                  Written by apps/web/lib/ai/run-ledger.ts (AI SDK
--                  middleware on every model in lib/ai/provider.ts).
--
--   ai_run_writes  one row per write a Flight Crew tool made to the
--                  agent's data: tool, table, row id, action, the row
--                  before (before_image) and after (after_image), and
--                  undone_at. Written by apps/web/lib/ai/write-ledger.ts,
--                  which watches the tool's own PostgREST requests. AI
--                  message text in draft tables is stored as a length and
--                  hash, not the text (packages/core/lib/ai-activity.ts).
--
-- Both are written by the service role only. The owner can read their own
-- rows (the "AI activity" page, the phone list, Flight Crew getAIActivity,
-- the connector's get_ai_activity). Undo (packages/core/lib/ai-undo.ts)
-- plans as the signed-in user, then applies the whole plan in ONE
-- transaction with fn_ai_undo_apply (SECURITY INVOKER: the target tables'
-- own RLS applies), which re-checks every record under a row lock and marks
-- the ledger rows undone. Any mismatch rolls the lot back.
--
-- Retention (the daily db-health job): before/after images are cleared
-- after 30 days (the undo window); ai_runs and ai_run_writes rows are
-- deleted after 13 months.
--
-- Grants: SELECT only for authenticated (a ledger the user can't edit),
-- full DML for service_role. RLS has no write policies, so even a broader
-- grant would refuse a user write.
-- ============================================================================

-- ── ai_runs ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_runs (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL for system jobs with no user (crons that aren't per user).
  user_id             uuid          REFERENCES auth.users(id) ON DELETE CASCADE,
  feature             text          NOT NULL DEFAULT 'unknown' CHECK (char_length(feature) <= 80),
  provider            text          NOT NULL CHECK (char_length(provider) <= 60),
  model_id            text          NOT NULL CHECK (char_length(model_id) <= 100),
  -- Groups the model calls of one request (a chat turn's tool steps).
  request_id          text          CHECK (char_length(request_id) <= 100),
  call_type           text          NOT NULL CHECK (call_type IN ('generate', 'stream')),
  -- All input tokens, cached ones included; the two cache columns are the
  -- cached share of it.
  input_tokens        integer       CHECK (input_tokens >= 0),
  output_tokens       integer       CHECK (output_tokens >= 0),
  cache_read_tokens   integer       CHECK (cache_read_tokens >= 0),
  cache_write_tokens  integer       CHECK (cache_write_tokens >= 0),
  reasoning_tokens    integer       CHECK (reasoning_tokens >= 0),
  -- From the list prices in lib/ai/provider.ts (MODEL_PRICES). An estimate,
  -- not the invoice.
  estimated_cost_usd  numeric(12,6) CHECK (estimated_cost_usd >= 0),
  latency_ms          integer       CHECK (latency_ms >= 0),
  outcome             text          NOT NULL CHECK (outcome IN ('ok', 'error', 'aborted')),
  -- The error's class and HTTP status ("APICallError 529"), never its message.
  error_class         text          CHECK (char_length(error_class) <= 120),
  finish_reason       text          CHECK (char_length(finish_reason) <= 40),
  created_at          timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_runs IS
  'One row per AI model call: feature, model, tokens, estimated cost, latency, outcome. Never prompt or completion text. Written by the service role (lib/ai/run-ledger.ts).';

ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_runs_select_own"
  ON public.ai_runs FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- Supabase's default privileges would give authenticated full DML; the
-- ledger is read-only to users (RLS has no write policies either).
REVOKE ALL ON public.ai_runs FROM anon, authenticated;
GRANT SELECT ON public.ai_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_runs TO service_role;

-- "My AI calls, newest first" and the daily failure count.
CREATE INDEX IF NOT EXISTS ai_runs_user_created_idx
  ON public.ai_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_runs_failed_created_idx
  ON public.ai_runs (created_at DESC) WHERE outcome <> 'ok';
-- The daily retention delete (rows past 13 months).
CREATE INDEX IF NOT EXISTS ai_runs_created_idx
  ON public.ai_runs (created_at);

-- ── ai_run_writes ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_run_writes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The model call that asked for the tool, when known. No FK: both ledgers
  -- are written asynchronously, so this row can land before its run row.
  ai_run_id     uuid,
  request_id    text        CHECK (char_length(request_id) <= 100),
  -- One tool call can write several rows (a draft row, then its text).
  -- Undo works on the whole tool call.
  tool_call_id  text        NOT NULL CHECK (char_length(tool_call_id) <= 120),
  tool_name     text        NOT NULL CHECK (char_length(tool_name) <= 80),
  -- chat: run by the model during a chat turn; approval: run after the agent
  -- approved it (/api/chat/approve).
  source        text        NOT NULL CHECK (source IN ('chat', 'approval', 'mcp', 'other')),
  -- Order of the writes inside one tool call (undo runs them in reverse).
  seq           integer     NOT NULL DEFAULT 0 CHECK (seq >= 0),
  table_name    text        NOT NULL CHECK (char_length(table_name) <= 80),
  row_id        text        CHECK (char_length(row_id) <= 100),
  action        text        NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  before_image  jsonb,
  after_image   jsonb,
  outcome       text        NOT NULL DEFAULT 'ok' CHECK (outcome IN ('ok', 'error')),
  -- PostgREST/Postgres error code ("42703") or "http 500", never a message.
  error_class   text        CHECK (char_length(error_class) <= 120),
  -- Set when undo must never be offered for this write, in plain words: a
  -- deleted row other rows pointed at (their links were nulled or cascaded
  -- by the delete and undo can't put them back), or too many rows at once.
  irreversible_reason text    CHECK (char_length(irreversible_reason) <= 300),
  undone_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_run_writes IS
  'One row per write a Flight Crew tool made: table, row, action, before and after images, undone_at. Written by the service role (lib/ai/write-ledger.ts); undo marks rows with fn_mark_ai_writes_undone.';

ALTER TABLE public.ai_run_writes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_run_writes_select_own"
  ON public.ai_run_writes FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- Supabase's default privileges would give authenticated full DML; the
-- ledger is read-only to users (RLS has no write policies either).
REVOKE ALL ON public.ai_run_writes FROM anon, authenticated;
GRANT SELECT ON public.ai_run_writes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_run_writes TO service_role;

-- "My AI changes, newest first", one tool call's writes, and the daily
-- failure count.
CREATE INDEX IF NOT EXISTS ai_run_writes_user_created_idx
  ON public.ai_run_writes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_run_writes_user_tool_call_idx
  ON public.ai_run_writes (user_id, tool_call_id);
CREATE INDEX IF NOT EXISTS ai_run_writes_failed_created_idx
  ON public.ai_run_writes (created_at DESC) WHERE outcome = 'error';
-- The daily retention work: images past 30 days, rows past 13 months.
CREATE INDEX IF NOT EXISTS ai_run_writes_created_idx
  ON public.ai_run_writes (created_at);

-- ── fn_ai_row_references ────────────────────────────────────────────────────
-- Before undo deletes a row the AI created, it asks which rows now point at
-- it (through any foreign key in public on its id, composite ones too), so
-- undoing "created
-- a client" never cascades away calls or notes the agent logged since.
-- p_exclude_ids: rows of the same tool call, which the undo removes first.
--
-- SECURITY INVOKER: counts only rows the caller can see under RLS (their
-- own). A table the caller can't read comes back with refs = -1, which the
-- undo treats as "can't tell", so it refuses rather than guesses.

CREATE OR REPLACE FUNCTION public.fn_ai_row_references(
  p_table       text,
  p_row_id      uuid,
  p_exclude_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (child_table text, child_column text, refs bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r        record;
  v_has_id boolean;
  v_n      bigint;
BEGIN
  IF p_table IS NULL OR p_row_id IS NULL THEN
    RETURN;
  END IF;

  -- Every foreign key into p_table that includes its uuid `id`, single or
  -- composite: a composite key like (user_id, vehicle_id) → vehicles
  -- (user_id, id) (00184) is matched on the column paired with `id`.
  FOR r IN
    SELECT DISTINCT cl.relname::text AS child, att.attname::text AS col
    FROM pg_constraint con
    JOIN pg_class parent       ON parent.oid = con.confrelid
    JOIN pg_namespace pn       ON pn.oid = parent.relnamespace
    JOIN pg_class cl           ON cl.oid = con.conrelid
    JOIN pg_namespace cn       ON cn.oid = cl.relnamespace
    CROSS JOIN LATERAL generate_subscripts(con.confkey, 1) AS k(i)
    JOIN pg_attribute patt     ON patt.attrelid = con.confrelid AND patt.attnum = con.confkey[k.i]
    JOIN pg_attribute att      ON att.attrelid = con.conrelid AND att.attnum = con.conkey[k.i]
    WHERE con.contype = 'f'
      AND pn.nspname = 'public'
      AND cn.nspname = 'public'
      AND parent.relname = p_table
      AND patt.attname = 'id'
      AND patt.atttypid = 'uuid'::regtype
    ORDER BY 1, 2
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', r.child)::regclass
        AND a.attname = 'id'
        AND a.atttypid = 'uuid'::regtype
        AND NOT a.attisdropped
    ) INTO v_has_id;

    BEGIN
      IF v_has_id THEN
        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1 AND NOT (id = ANY ($2))', r.child, r.col)
          INTO v_n USING p_row_id, coalesce(p_exclude_ids, '{}'::uuid[]);
      ELSE
        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.child, r.col)
          INTO v_n USING p_row_id;
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      v_n := -1;
    END;

    IF v_n <> 0 THEN
      child_table := r.child;
      child_column := r.col;
      refs := v_n;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ai_row_references(text, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ai_row_references(text, uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_ai_row_references(text, uuid, uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_ai_row_references(text, uuid, uuid[]) IS
  'Rows (visible to the caller) that reference p_row_id in p_table through any FK on its id (single or composite), excluding p_exclude_ids. refs = -1: a table the caller cannot read. Used by AI undo and the write ledger.';

-- ── fn_mark_ai_writes_undone ────────────────────────────────────────────────
-- The one write a user makes to the ledger: stamping undone_at on their own
-- successful AI writes after the undo restored them. Nothing else changes.

CREATE OR REPLACE FUNCTION public.fn_mark_ai_writes_undone(p_write_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_write_ids IS NULL OR cardinality(p_write_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(p_write_ids) > 500 THEN
    RAISE EXCEPTION 'too many rows at once (max 500)' USING ERRCODE = '22023';
  END IF;

  UPDATE ai_run_writes
     SET undone_at = now()
   WHERE user_id = v_uid
     AND id = ANY (p_write_ids)
     AND outcome = 'ok'
     AND undone_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_mark_ai_writes_undone(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_mark_ai_writes_undone(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_mark_ai_writes_undone(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_mark_ai_writes_undone(uuid[]) IS
  'Stamps undone_at on the caller''s own successful AI writes (after AI undo restored them). Returns the number of rows marked.';

-- ── fn_ai_undo_apply ────────────────────────────────────────────────────────
-- Applies one AI undo plan in a single transaction. p_steps is a JSON array,
-- in the order to apply:
--   {"op":"delete","table":t,"pk":col,"row_id":id,"expect":{...}}
--   {"op":"update","table":t,"pk":col,"row_id":id,"expect":{...},"set":{...}}
--   {"op":"insert","table":t,"row":{...}}
-- "expect" is the row as the AI left it (AI-written text left out): every key
-- must still match, checked under FOR UPDATE, or the whole undo raises and
-- rolls back.
-- An update may also carry "no_later": {"table","column","value","after",
-- "exclude_ids","skip_column","skip_value"}. It refuses if a row of that
-- table points at this one and was created after "after" (other than the
-- excluded ids and rows whose skip_column = skip_value). Putting back a
-- client's last contact, first contact and status after a logged call is
-- only right if no other call was logged since: the trigger only moves
-- last_contact_at forward, so a later call with an earlier date leaves the
-- client row looking untouched. A client is removed with fn_delete_clients, the one way the app
-- deletes clients; if it would archive instead, the undo rolls back.
-- Generated columns are never written. Then the ledger rows are marked undone
-- (fn_mark_ai_writes_undone), in the same transaction.
--
-- SECURITY INVOKER: every read and write runs under the caller's own RLS, so
-- it can do nothing the caller couldn't do through the Data API. It refuses
-- outright to touch consent records (CASL evidence, 00183), the ledger
-- tables, and a client's opt-out columns. Errors carry
-- a fixed prefix the app maps to plain words:
--   ai_undo_changed / ai_undo_gone / ai_undo_count / ai_undo_archived /
--   ai_undo_later / ai_undo_bad_step.

CREATE OR REPLACE FUNCTION public.fn_ai_undo_apply(p_steps jsonb, p_write_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  s       jsonb;
  v_table text;
  v_pk    text;
  v_row   text;
  v_op    text;
  v_rel   regclass;
  v_key   text;
  v_cur   jsonb;
  v_cols  text;
  v_res   jsonb;
  v_g     jsonb;
  v_found boolean;
  v_n     integer;
  v_done  integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(coalesce(p_steps, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_steps, '[]'::jsonb)) > 200 THEN
    RAISE EXCEPTION 'ai_undo_bad_step: steps must be an array of at most 200';
  END IF;

  FOR s IN SELECT value FROM jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) LOOP
    v_op    := s->>'op';
    v_table := s->>'table';
    v_pk    := coalesce(s->>'pk', 'id');
    v_row   := s->>'row_id';
    IF v_table IS NULL OR v_op IS NULL THEN
      RAISE EXCEPTION 'ai_undo_bad_step: op and table are required';
    END IF;
    -- Never: CASL evidence (00183's consent ledger is append-only), the
    -- ledger itself, or an opt-out (an unsubscribe is never cleared by undo).
    IF v_table IN ('client_email_consents', 'consent_records', 'ai_runs', 'ai_run_writes') THEN
      RAISE EXCEPTION 'ai_undo_bad_step: % is never changed by undo', v_table;
    END IF;
    IF v_table = 'clients' AND EXISTS (
      SELECT 1 FROM jsonb_object_keys(coalesce(s->'set', '{}'::jsonb) || coalesce(s->'row', '{}'::jsonb)) k
      WHERE k ~ '^(email|sms)_opt_out_'
    ) THEN
      RAISE EXCEPTION 'ai_undo_bad_step: undo never changes an opt-out';
    END IF;
    v_rel := format('public.%I', v_table)::regclass;
    -- The key compared as its own type (index-friendly): the text id read
    -- through the table's row type.
    v_key := format('(jsonb_populate_record(NULL::public.%I, jsonb_build_object(%L, $1::text))).%I', v_table, v_pk, v_pk);

    IF v_op IN ('delete', 'update') THEN
      IF v_row IS NULL THEN
        RAISE EXCEPTION 'ai_undo_bad_step: row_id is required for %', v_op;
      END IF;
      EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.%I = %s FOR UPDATE', v_table, v_pk, v_key)
        INTO v_cur USING v_row;
      IF v_cur IS NULL THEN
        RAISE EXCEPTION 'ai_undo_gone: % %', v_table, v_row;
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_each(coalesce(s->'expect', '{}'::jsonb)) e
        WHERE (v_cur -> e.key) IS DISTINCT FROM e.value
      ) THEN
        RAISE EXCEPTION 'ai_undo_changed: % %', v_table, v_row;
      END IF;
    END IF;

    IF s ? 'no_later' THEN
      v_g := s->'no_later';
      IF v_g->>'table' IS NULL OR v_g->>'column' IS NULL OR v_g->>'after' IS NULL THEN
        RAISE EXCEPTION 'ai_undo_bad_step: no_later needs table, column and after';
      END IF;
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM public.%1$I c'
        ' WHERE c.%2$I = (jsonb_populate_record(NULL::public.%1$I, jsonb_build_object(%3$L, $1::text))).%2$I'
        '   AND c.created_at > $2::timestamptz'
        '   AND NOT (c.id::text = ANY ($3))'
        '   AND ($4::text IS NULL OR c.%4$I::text IS DISTINCT FROM $4::text))',
        v_g->>'table', v_g->>'column', v_g->>'column', coalesce(v_g->>'skip_column', v_g->>'column'))
      INTO v_found
      USING v_g->>'value',
            v_g->>'after',
            ARRAY(SELECT jsonb_array_elements_text(coalesce(v_g->'exclude_ids', '[]'::jsonb))),
            v_g->>'skip_value';
      IF v_found THEN
        RAISE EXCEPTION 'ai_undo_later: % %', v_table, v_row;
      END IF;
    END IF;

    IF v_op = 'delete' THEN
      IF v_table = 'clients' THEN
        v_res := fn_delete_clients(ARRAY[v_row::uuid], false);
        IF NOT coalesce((v_res -> 'deleted') ? v_row, false) THEN
          RAISE EXCEPTION 'ai_undo_archived: % %', v_table, v_row;
        END IF;
      ELSE
        EXECUTE format('DELETE FROM public.%I t WHERE t.%I = %s', v_table, v_pk, v_key) USING v_row;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n <> 1 THEN
          RAISE EXCEPTION 'ai_undo_count: % % (% rows)', v_table, v_row, v_n;
        END IF;
      END IF;

    ELSIF v_op = 'update' THEN
      SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) INTO v_cols
      FROM pg_attribute a
      WHERE a.attrelid = v_rel AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
        AND coalesce(s->'set', '{}'::jsonb) ? a.attname;
      IF v_cols IS NULL THEN
        RAISE EXCEPTION 'ai_undo_bad_step: nothing to set on % %', v_table, v_row;
      END IF;
      EXECUTE format(
        'UPDATE public.%I t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $2)) WHERE t.%I = %s',
        v_table, v_cols, v_cols, v_table, v_pk, v_key
      ) USING v_row, s->'set';
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'ai_undo_count: % % (% rows)', v_table, v_row, v_n;
      END IF;

    ELSIF v_op = 'insert' THEN
      SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) INTO v_cols
      FROM pg_attribute a
      WHERE a.attrelid = v_rel AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
        AND coalesce(s->'row', '{}'::jsonb) ? a.attname;
      IF v_cols IS NULL THEN
        RAISE EXCEPTION 'ai_undo_bad_step: nothing to insert into %', v_table;
      END IF;
      EXECUTE format(
        'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)',
        v_table, v_cols, v_cols, v_table
      ) USING s->'row';

    ELSE
      RAISE EXCEPTION 'ai_undo_bad_step: unknown op %', v_op;
    END IF;

    v_done := v_done + 1;
  END LOOP;

  PERFORM fn_mark_ai_writes_undone(p_write_ids);
  RETURN v_done;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ai_undo_apply(jsonb, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ai_undo_apply(jsonb, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_ai_undo_apply(jsonb, uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_ai_undo_apply(jsonb, uuid[]) IS
  'Applies one AI undo plan (delete/update/insert steps) in one transaction under the caller''s RLS, re-checking each record against the expected image under a row lock, then marks the ledger rows undone. Any mismatch rolls back everything.';

-- ── fn_ai_run_summary ───────────────────────────────────────────────────────
-- The AI activity totals for the caller since p_since, one row per feature:
-- calls, failures, stopped calls and estimated cost, counted in Postgres
-- rather than paged into the app. SECURITY INVOKER plus the explicit
-- user_id filter: only the caller's own calls (ai_runs_user_created_idx).

CREATE OR REPLACE FUNCTION public.fn_ai_run_summary(p_since timestamptz)
RETURNS TABLE (feature text, calls bigint, failed bigint, aborted bigint, cost_usd numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT r.feature,
         count(*)                                  AS calls,
         count(*) FILTER (WHERE r.outcome = 'error')   AS failed,
         count(*) FILTER (WHERE r.outcome = 'aborted') AS aborted,
         coalesce(sum(r.estimated_cost_usd), 0)    AS cost_usd
  FROM ai_runs r
  WHERE r.user_id = (select auth.uid())
    AND r.created_at >= p_since
  GROUP BY r.feature
$$;

REVOKE ALL ON FUNCTION public.fn_ai_run_summary(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ai_run_summary(timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_ai_run_summary(timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_ai_run_summary(timestamptz) IS
  'The caller''s AI calls since p_since, per feature: calls, failed, aborted, estimated cost. For the AI activity totals.';
