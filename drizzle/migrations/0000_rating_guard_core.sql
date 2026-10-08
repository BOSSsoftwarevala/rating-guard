CREATE TABLE public.scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  is_seed boolean NOT NULL DEFAULT false,
  data_source text NOT NULL DEFAULT 'google_places',
  source_url text NOT NULL,
  place_id text,
  business_name text,
  category text,
  address text,
  rating numeric(2,1),
  total_reviews integer,
  maps_uri text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  high_count integer NOT NULL DEFAULT 0,
  medium_count integer NOT NULL DEFAULT 0,
  normal_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scans TO authenticated;
GRANT ALL ON public.scans TO service_role;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or seed scans" ON public.scans FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_seed);
CREATE POLICY "insert own scans" ON public.scans FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND is_seed = false);
CREATE POLICY "update own scans" ON public.scans FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "delete own scans" ON public.scans FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  author text NOT NULL DEFAULT 'Anonymous',
  author_uri text,
  rating integer NOT NULL,
  published_at timestamptz,
  relative_time text,
  text text,
  review_uri text,
  risk text NOT NULL DEFAULT 'normal',
  policy_category text,
  indicators text[] NOT NULL DEFAULT '{}',
  reason text,
  evidence text,
  confidence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read reviews of visible scans" ON public.reviews FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_id AND (s.user_id = auth.uid() OR s.is_seed)));
CREATE POLICY "write reviews of own scans" ON public.reviews FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_id AND s.user_id = auth.uid()));
CREATE INDEX reviews_scan_idx ON public.reviews(scan_id);
CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  is_seed boolean NOT NULL DEFAULT false,
  place_id text,
  name text NOT NULL,
  category text,
  address text,
  rating numeric(2,1),
  total_reviews integer,
  maps_uri text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_user_place_key UNIQUE (user_id, place_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or seed businesses" ON public.businesses FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_seed);
CREATE POLICY "insert own businesses" ON public.businesses FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND NOT is_seed);
CREATE POLICY "update own businesses" ON public.businesses FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE INDEX businesses_place_id_idx ON public.businesses(place_id);
ALTER TABLE public.scans ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  ADD COLUMN reviews_retrieved integer NOT NULL DEFAULT 0,
  ADD COLUMN requires_review_count integer NOT NULL DEFAULT 0,
  ADD COLUMN stage text,
  ADD COLUMN started_at timestamptz DEFAULT now(),
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN api_rating_raw numeric,
  ADD COLUMN api_total_reviews_raw integer,
  ADD COLUMN rating_mismatch boolean NOT NULL DEFAULT false,
  ADD COLUMN data_quality text,
  ADD COLUMN data_quality_reasons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN review_health_score integer,
  ADD COLUMN reviews_failed_analysis integer NOT NULL DEFAULT 0;
CREATE INDEX scans_user_created_idx ON public.scans(user_id, created_at DESC);
CREATE INDEX scans_business_id_idx ON public.scans(business_id);
CREATE INDEX scans_created_at_idx ON public.scans(created_at DESC);
CREATE TABLE public.review_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL UNIQUE REFERENCES public.reviews(id) ON DELETE CASCADE,
  scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  risk text NOT NULL DEFAULT 'requires_review',
  category text,
  signals text[] NOT NULL DEFAULT '{}',
  reason text,
  evidence text,
  confidence integer NOT NULL DEFAULT 0,
  model text,
  analysis_provider text,
  analysis_version text,
  prompt_version text,
  content_hash text,
  verification jsonb,
  cached boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_analyses_scan_idx ON public.review_analyses(scan_id);
CREATE INDEX review_analyses_risk_idx ON public.review_analyses(risk);
CREATE INDEX review_analyses_cache_idx ON public.review_analyses(content_hash, analysis_version);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_analyses TO authenticated;
GRANT ALL ON public.review_analyses TO service_role;
ALTER TABLE public.review_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read analyses of visible scans" ON public.review_analyses FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_id AND (s.user_id = auth.uid() OR s.is_seed)));
CREATE POLICY "write analyses of own scans" ON public.review_analyses FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_id AND s.user_id = auth.uid()));
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL UNIQUE REFERENCES public.scans(id) ON DELETE CASCADE,
  user_id uuid,
  is_seed boolean NOT NULL DEFAULT false,
  report_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'ready',
  recommended_action text,
  summary text,
  high_risk_count integer NOT NULL DEFAULT 0,
  medium_risk_count integer NOT NULL DEFAULT 0,
  normal_count integer NOT NULL DEFAULT 0,
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or seed reports" ON public.reports FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_seed);
CREATE POLICY "insert own reports" ON public.reports FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND NOT is_seed);
CREATE POLICY "update own reports" ON public.reports FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE INDEX reports_user_id_idx ON public.reports(user_id);
CREATE INDEX reports_created_at_idx ON public.reports(created_at DESC);
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  resource text,
  resource_id text,
  result text NOT NULL DEFAULT 'success',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_user_idx ON public.audit_log(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own audit" ON public.audit_log FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "insert own audit" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Admin',
  username text,
  avatar_path text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "avatar own read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatar own upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatar own update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE TABLE public.scan_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  batch_number serial,
  total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.scan_batches TO authenticated;
GRANT USAGE ON SEQUENCE public.scan_batches_batch_number_seq TO authenticated;
GRANT ALL ON public.scan_batches TO service_role;
ALTER TABLE public.scan_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own batches read" ON public.scan_batches FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own batches insert" ON public.scan_batches FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own batches update" ON public.scan_batches FOR UPDATE TO authenticated USING (user_id = auth.uid());
ALTER TABLE public.scans ADD COLUMN batch_id uuid REFERENCES public.scan_batches(id);
CREATE INDEX scans_batch_id_idx ON public.scans(batch_id);
ALTER SEQUENCE public.scan_batches_batch_number_seq RESTART WITH 1001;
CREATE TABLE public.scan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  message text,
  duration_ms integer,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.scan_events TO authenticated;
GRANT ALL ON public.scan_events TO service_role;
ALTER TABLE public.scan_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scan events read" ON public.scan_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own scan events insert" ON public.scan_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_id AND s.user_id = auth.uid()));
CREATE INDEX scan_events_scan_idx ON public.scan_events(scan_id, created_at);
CREATE INDEX scan_events_user_idx ON public.scan_events(user_id, created_at DESC);
ALTER TABLE public.reviews ADD COLUMN processing_status text NOT NULL DEFAULT 'STORED', ADD COLUMN content_hash text;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_processing_status_chk CHECK (processing_status IN ('RETRIEVED','STORED','ANALYZED','FAILED','SKIPPED'));
CREATE INDEX reviews_hash_idx ON public.reviews(content_hash);
CREATE TABLE public.review_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL UNIQUE REFERENCES public.reviews(id) ON DELETE CASCADE,
  scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'NOT_REVIEWED' CHECK (status IN ('NOT_REVIEWED','REVIEWED','ACTION_RECOMMENDED','GOOGLE_REPORTING_PATH_AVAILABLE','USER_ACTION_PENDING','RESOLVED','NOT_ACTIONABLE')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.review_actions TO authenticated;
GRANT ALL ON public.review_actions TO service_role;
ALTER TABLE public.review_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own actions read" ON public.review_actions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own actions insert" ON public.review_actions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_id AND s.user_id = auth.uid()));
CREATE POLICY "own actions update" ON public.review_actions FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE INDEX review_actions_user_idx ON public.review_actions(user_id, status);
CREATE TABLE public.error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  module text NOT NULL,
  route text,
  scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  business text,
  code text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','INVESTIGATING','FIXED','VERIFIED')),
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.error_events TO authenticated;
GRANT ALL ON public.error_events TO service_role;
ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own errors read" ON public.error_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own errors insert" ON public.error_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own errors update" ON public.error_events FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE INDEX error_events_user_idx ON public.error_events(user_id, created_at DESC);
CREATE TABLE public.debug_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_code text NOT NULL UNIQUE,
  severity text NOT NULL CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  module text NOT NULL,
  component text,
  route text,
  description text NOT NULL,
  expected text,
  actual text,
  reproduction text,
  root_cause text,
  fix text,
  verification text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','FIXING','FIXED','RETESTING','VERIFIED','BLOCKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.debug_findings TO authenticated;
GRANT ALL ON public.debug_findings TO service_role;
ALTER TABLE public.debug_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read findings" ON public.debug_findings FOR SELECT TO authenticated USING (true);
CREATE TABLE public.site_content (
  id text PRIMARY KEY DEFAULT 'home',
  published jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_content TO anon;
GRANT SELECT, INSERT, UPDATE ON public.site_content TO authenticated;
GRANT ALL ON public.site_content TO service_role;
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read homepage content" ON public.site_content FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.site_content (id) VALUES ('home');

CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
CREATE POLICY "Admin can insert homepage content" ON public.site_content FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update homepage content" ON public.site_content FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "update reviews of own scans" ON public.reviews FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_id AND s.user_id = auth.uid()));
CREATE POLICY "admin read scans" ON public.scans FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin read reviews" ON public.reviews FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin read analyses" ON public.review_analyses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin read reports" ON public.reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin read businesses" ON public.businesses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username) VALUES (NEW.id, NEW.email) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, CASE WHEN lower(NEW.email) = 'theratingguard@gmail.com' THEN 'admin'::public.app_role ELSE 'user'::public.app_role END)
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.place_cache (
  place_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.place_cache TO service_role;
ALTER TABLE public.place_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.scan_batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','partial','failed')),
  attempts integer NOT NULL DEFAULT 0,
  scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  error text,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, url)
);
CREATE INDEX scan_jobs_ready_idx ON public.scan_jobs(status, next_run_at);
CREATE INDEX scan_jobs_batch_idx ON public.scan_jobs(batch_id, position);
GRANT SELECT ON public.scan_jobs TO authenticated;
GRANT ALL ON public.scan_jobs TO service_role;
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs read" ON public.scan_jobs FOR SELECT TO authenticated USING (user_id = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_jobs;

CREATE TABLE public.system_state (
  id text PRIMARY KEY DEFAULT 'main',
  queue_paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  paused_at timestamptz,
  worker_lock_until timestamptz,
  daily_link_cap integer NOT NULL DEFAULT 1000,
  last_worker_run timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_state TO authenticated;
GRANT ALL ON public.system_state TO service_role;
ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in read state" ON public.system_state FOR SELECT TO authenticated USING (true);
INSERT INTO public.system_state (id) VALUES ('main');

CREATE OR REPLACE FUNCTION public.acquire_worker_lock(_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  UPDATE public.system_state SET worker_lock_until = now() + make_interval(secs => _seconds), last_worker_run = now()
  WHERE id = 'main' AND (worker_lock_until IS NULL OR worker_lock_until < now())
  RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END $$;
REVOKE EXECUTE ON FUNCTION public.acquire_worker_lock(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_worker_lock(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_scan_jobs(_limit integer)
RETURNS SETOF public.scan_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.scan_jobs j SET status = 'processing', attempts = j.attempts + 1, locked_until = now() + interval '5 minutes', updated_at = now()
  WHERE j.id IN (
    SELECT id FROM public.scan_jobs
    WHERE (status = 'pending' AND next_run_at <= now()) OR (status = 'processing' AND locked_until < now())
    ORDER BY next_run_at, position LIMIT _limit FOR UPDATE SKIP LOCKED
  ) RETURNING j.*;
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_scan_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scan_jobs(integer) TO service_role;