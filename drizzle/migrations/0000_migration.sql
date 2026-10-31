CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by signed-in users" ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; final text; n int := 0;
BEGIN
  base := lower(regexp_replace(coalesce(nullif(NEW.raw_user_meta_data->>'username',''), nullif(NEW.raw_user_meta_data->>'name',''), split_part(NEW.email,'@',1), 'trader'), '[^a-zA-Z0-9_]', '', 'g'));
  IF length(base) < 3 THEN base := 'trader' || base; END IF;
  base := left(base, 20);
  final := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final) LOOP
    n := n + 1; final := base || n::text;
  END LOOP;
  INSERT INTO public.profiles (id, username) VALUES (NEW.id, final);
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  host_id uuid NOT NULL,
  is_public boolean NOT NULL DEFAULT true,
  duration_minutes int NOT NULL DEFAULT 15,
  starting_cash numeric NOT NULL DEFAULT 10000,
  status text NOT NULL DEFAULT 'waiting',
  winner_id uuid,
  started_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.match_players (
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  username text NOT NULL,
  cash numeric NOT NULL,
  holdings jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_value numeric,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);
CREATE TABLE public.match_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  token text NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL,
  qty numeric NOT NULL,
  price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.matches, public.match_players, public.match_trades TO authenticated;
GRANT ALL ON public.matches, public.match_players, public.match_trades TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_trades ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_match_member(_match uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.match_players WHERE match_id = _match AND user_id = _user)
$$;
CREATE OR REPLACE FUNCTION public.is_match_public(_match uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.matches WHERE id = _match AND is_public)
$$;

CREATE POLICY "View public or own matches" ON public.matches FOR SELECT TO authenticated
  USING (is_public OR public.is_match_member(id, auth.uid()));
CREATE POLICY "View players of visible matches" ON public.match_players FOR SELECT TO authenticated
  USING (public.is_match_public(match_id) OR public.is_match_member(match_id, auth.uid()));
CREATE POLICY "View trades of own matches" ON public.match_trades FOR SELECT TO authenticated
  USING (public.is_match_member(match_id, auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_players;