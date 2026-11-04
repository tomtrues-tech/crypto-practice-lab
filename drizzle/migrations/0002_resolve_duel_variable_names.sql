CREATE OR REPLACE FUNCTION public.duel_action(p_action text, p_user uuid, p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_variable
DECLARE m public.matches%ROWTYPE; me public.match_players%ROWTYPE; pl public.match_players%ROWTYPE; n int; amount numeric; price numeric; qty numeric; oldqty numeric; oldcost numeric; remaining numeric; cash numeric; hs jsonb; token text; symbol text; scores jsonb := '{}'::jsonb; val numeric; best numeric; winner uuid; h record; code text;
BEGIN
 IF p_action = 'create' THEN
  n := (p_data->>'durationMinutes')::int;
  IF n IS NULL OR n < 1 OR n > 1440 THEN RAISE EXCEPTION 'Match length must be 1–1440 minutes'; END IF;
  code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  INSERT INTO public.matches(code,host_id,is_public,duration_minutes) VALUES(code,p_user,(p_data->>'isPublic')::boolean,n) RETURNING * INTO m;
  INSERT INTO public.match_players(match_id,user_id,username,cash) SELECT m.id,p_user,username,m.starting_cash FROM public.profiles WHERE id=p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player profile missing'; END IF;
  RETURN jsonb_build_object('id',m.id,'code',m.code);
 END IF;
 SELECT * INTO m FROM public.matches WHERE CASE WHEN nullif(p_data->>'id','') IS NOT NULL THEN id=(p_data->>'id')::uuid ELSE matches.code=upper(p_data->>'code') END FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No match found with that code'; END IF;
 SELECT * INTO me FROM public.match_players WHERE match_id=m.id AND user_id=p_user;
 IF p_action='join' THEN
  IF me.user_id IS NOT NULL THEN RETURN jsonb_build_object('id',m.id); END IF;
  SELECT count(*) INTO n FROM public.match_players WHERE match_id=m.id;
  IF m.status<>'waiting' OR n<>1 THEN RAISE EXCEPTION 'This match is already full or started'; END IF;
  INSERT INTO public.match_players(match_id,user_id,username,cash) SELECT m.id,p_user,username,m.starting_cash FROM public.profiles WHERE id=p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player profile missing'; END IF;
  UPDATE public.matches SET status='active',started_at=clock_timestamp(),ends_at=clock_timestamp()+make_interval(mins=>m.duration_minutes) WHERE id=m.id;
  RETURN jsonb_build_object('id',m.id);
 END IF;
 IF me.user_id IS NULL THEN RAISE EXCEPTION 'You are not in this match'; END IF;
 IF p_action='cancel' THEN
  IF m.host_id<>p_user OR m.status<>'waiting' THEN RAISE EXCEPTION 'Cannot cancel this match'; END IF;
  DELETE FROM public.matches WHERE id=m.id;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_action='trade' THEN
  IF m.status<>'active' OR m.ends_at IS NULL OR m.ends_at<=clock_timestamp() THEN RAISE EXCEPTION 'Match is not live'; END IF;
  token:=p_data->>'token'; symbol:=p_data->>'symbol'; price:=(p_data->>'price')::numeric; amount:=(p_data->>'usd')::numeric;
  IF price IS NULL OR price<=0 OR price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Price unavailable'; END IF;
  hs:=me.holdings; cash:=me.cash; oldqty:=coalesce((hs->token->>'qty')::numeric,0); oldcost:=coalesce((hs->token->>'cost')::numeric,0);
  IF p_data->>'side'='BUY' THEN
   IF amount IS NULL OR amount<=0 OR amount::text IN ('NaN','Infinity','-Infinity') OR amount>cash THEN RAISE EXCEPTION 'Not enough cash or invalid amount'; END IF;
   qty:=amount/price; cash:=cash-amount;
   hs:=jsonb_set(hs,ARRAY[token],jsonb_build_object('qty',oldqty+qty,'cost',oldcost+amount,'symbol',symbol));
  ELSIF p_data->>'side'='SELL' THEN
   IF oldqty<=0 THEN RAISE EXCEPTION 'You do not hold that token'; END IF;
   IF coalesce((p_data->>'closeAll')::boolean,false) THEN qty:=oldqty;
   ELSE
    IF amount IS NULL OR amount<=0 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Enter a valid amount'; END IF;
    qty:=least(oldqty,amount/price);
   END IF;
   cash:=cash+qty*price; remaining:=oldqty-qty;
   IF remaining<=oldqty*0.000000001 THEN hs:=hs-token;
   ELSE hs:=jsonb_set(hs,ARRAY[token],jsonb_build_object('qty',remaining,'cost',oldcost*remaining/oldqty,'symbol',symbol)); END IF;
  ELSE RAISE EXCEPTION 'Bad side'; END IF;
  UPDATE public.match_players SET cash=cash,holdings=hs WHERE match_id=m.id AND user_id=p_user;
  INSERT INTO public.match_trades(match_id,user_id,token,symbol,side,qty,price) VALUES(m.id,p_user,token,symbol,p_data->>'side',qty,price);
  RETURN jsonb_build_object('price',price,'qty',qty,'symbol',symbol);
 END IF;
 IF p_action='finish' THEN
  IF m.status='finished' THEN RETURN jsonb_build_object('ok',true); END IF;
  IF m.status<>'active' OR m.ends_at IS NULL OR m.ends_at>clock_timestamp() THEN RAISE EXCEPTION 'Match still running'; END IF;
  SELECT count(*) INTO n FROM public.match_players WHERE match_id=m.id;
  IF n<>2 THEN RAISE EXCEPTION 'Match needs exactly two players'; END IF;
  FOR pl IN SELECT * FROM public.match_players WHERE match_id=m.id ORDER BY user_id LOOP
   val:=pl.cash;
   FOR h IN SELECT key,value FROM jsonb_each(pl.holdings) LOOP
    price:=(p_data->'prices'->>h.key)::numeric;
    IF price IS NULL OR price<=0 OR price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Final prices unavailable; retrying settlement'; END IF;
    val:=val+(h.value->>'qty')::numeric*price;
   END LOOP;
   val:=round(val,2); scores:=jsonb_set(scores,ARRAY[pl.user_id::text],to_jsonb(val));
   IF best IS NULL OR val>best THEN best:=val; winner:=pl.user_id; ELSIF val=best THEN winner:=NULL; END IF;
  END LOOP;
  UPDATE public.match_players SET final_value=(scores->>user_id::text)::numeric WHERE match_id=m.id;
  UPDATE public.matches SET status='finished',winner_id=winner WHERE id=m.id;
  RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION 'Unknown match action';
END $$;
REVOKE ALL ON FUNCTION public.duel_action(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.duel_action(text,uuid,jsonb) TO service_role;