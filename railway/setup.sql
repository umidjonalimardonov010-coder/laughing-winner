-- Kassa 24/7: to'liq ma'lumotlar bazasi sozlamasi (o'zingizning PostgreSQL bazangiz uchun).
-- Railway'da bazani ochib, shu faylni bir marta ishga tushirasiz (CLI yoki SQL muharriri).
-- Qayta ishga tushirish xatosiz o'tadi: hammasi "yo'q bo'lsa yaratadi".

-- Telegram foydalanuvchilari
CREATE TABLE IF NOT EXISTS public.tg_users (
  id bigint PRIMARY KEY,
  username text,
  first_name text,
  last_name text,
  photo_url text,
  phone text,
  lang text NOT NULL DEFAULT 'uz',
  lang_chosen boolean NOT NULL DEFAULT false,
  balance bigint NOT NULL DEFAULT 0,
  referrer_id bigint REFERENCES public.tg_users(id) ON DELETE SET NULL,
  referral_earned bigint NOT NULL DEFAULT 0,
  is_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tg_users_referrer_idx ON public.tg_users(referrer_id);

-- Bukmekerlar
CREATE TABLE IF NOT EXISTS public.bookmakers (
  id text PRIMARY KEY,
  name text NOT NULL,
  logo_url text,
  deposit_enabled boolean NOT NULL DEFAULT true,
  withdraw_enabled boolean NOT NULL DEFAULT true,
  deposit_fee_percent numeric(6,2) NOT NULL DEFAULT 0,
  withdraw_fee_percent numeric(6,2) NOT NULL DEFAULT 0,
  address text NOT NULL DEFAULT 'Toshkent shahar',
  min_amount bigint NOT NULL DEFAULT 5000,
  max_amount bigint NOT NULL DEFAULT 10000000,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.bookmakers (id, name, deposit_enabled, withdraw_enabled, address, sort_order, is_active) VALUES
  ('1xbet', '1XBET', true, true, 'Toshkent shahar, Kassa 24/7', 1, true),
  ('linebet', 'LINEBET', true, true, 'Toshkent shahar, Kassa 24/7', 2, true),
  ('melbet', 'MELBET', true, true, 'Toshkent shahar, Kassa 24/7', 3, true),
  ('dbbet', 'DB-BET', false, true, 'Toshkent shahar, Kassa 24/7', 4, false),
  ('xparibet', 'XPARIBET', false, true, 'Toshkent shahar, Olmazor', 5, true),
  ('winwin', 'WINWIN', false, true, 'Toshkent shahar, Kassa 24/7', 6, true)
ON CONFLICT (id) DO NOTHING;

-- Amaliyot turlari va holatlari
DO $$ BEGIN
  CREATE TYPE public.tx_type AS ENUM ('wallet_topup','card_withdraw','bk_deposit','bk_withdraw','referral_bonus','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.tx_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- So'rovlar / amaliyotlar
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number bigserial UNIQUE,
  user_id bigint NOT NULL REFERENCES public.tg_users(id) ON DELETE CASCADE,
  type public.tx_type NOT NULL,
  status public.tx_status NOT NULL DEFAULT 'pending',
  bookmaker_id text REFERENCES public.bookmakers(id) ON DELETE SET NULL,
  account_id text,
  withdraw_code text,
  card_number text,
  amount bigint NOT NULL DEFAULT 0,
  bonus bigint NOT NULL DEFAULT 0,
  fee bigint NOT NULL DEFAULT 0,
  receipt_path text,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS transactions_user_idx ON public.transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON public.transactions(status, created_at DESC);

-- Sozlamalar
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (key, value) VALUES
  ('brand_name', 'Kassa 24/7'),
  ('card_number', ''),
  ('card_holder', ''),
  ('support_username', ''),
  ('channel_username', ''),
  ('admin_chat_id', ''),
  ('deposit_bonus_percent', '1'),
  ('referral_percent', '2'),
  ('min_topup', '5000'),
  ('max_topup', '10000000'),
  ('min_card_withdraw', '10000'),
  ('max_card_withdraw', '10000000'),
  ('public_url', ''),
  ('bot_username', '')
ON CONFLICT (key) DO NOTHING;

-- Videolar (tayyor joylar, admin fayl yuklaydi)
CREATE TABLE IF NOT EXISTS public.videos (
  slot text PRIMARY KEY,
  url text,
  storage_path text,
  tg_file_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Atomic: hamyondan pul oluvchi so'rov yaratish (kartaga yechish, bukmekerga to'ldirish)
CREATE OR REPLACE FUNCTION public.create_debit_request(
  p_user_id bigint, p_type public.tx_type, p_amount bigint, p_bookmaker_id text,
  p_account_id text, p_card_number text, p_bonus bigint, p_fee bigint
) RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance bigint;
  v_tx public.transactions;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT balance INTO v_balance FROM public.tg_users WHERE id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  UPDATE public.tg_users SET balance = balance - p_amount WHERE id = p_user_id;
  INSERT INTO public.transactions (user_id, type, amount, bookmaker_id, account_id, card_number, bonus, fee)
  VALUES (p_user_id, p_type, p_amount, p_bookmaker_id, p_account_id, p_card_number, COALESCE(p_bonus,0), COALESCE(p_fee,0))
  RETURNING * INTO v_tx;
  RETURN v_tx;
END $$;

-- Atomic: kutilayotgan so'rovni tasdiqlash
CREATE OR REPLACE FUNCTION public.approve_transaction(
  p_tx_id uuid, p_amount bigint, p_fee_percent numeric, p_referral_percent numeric, p_note text
) RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx public.transactions;
  v_credit bigint;
  v_fee bigint;
  v_referrer bigint;
  v_ref_bonus bigint;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_tx_id FOR UPDATE;
  IF v_tx.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_tx.status <> 'pending' THEN RAISE EXCEPTION 'already_processed'; END IF;

  IF v_tx.type = 'wallet_topup' THEN
    v_credit := COALESCE(NULLIF(p_amount,0), v_tx.amount);
    IF v_credit <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
    UPDATE public.tg_users SET balance = balance + v_credit WHERE id = v_tx.user_id;
    UPDATE public.transactions SET amount = v_credit WHERE id = v_tx.id;
  ELSIF v_tx.type = 'bk_withdraw' THEN
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'amount_required'; END IF;
    v_fee := floor(p_amount * COALESCE(p_fee_percent,0) / 100);
    v_credit := p_amount - v_fee;
    UPDATE public.tg_users SET balance = balance + v_credit WHERE id = v_tx.user_id;
    UPDATE public.transactions SET amount = p_amount, fee = v_fee WHERE id = v_tx.id;
  ELSIF v_tx.type = 'bk_deposit' THEN
    SELECT referrer_id INTO v_referrer FROM public.tg_users WHERE id = v_tx.user_id;
    IF v_referrer IS NOT NULL AND COALESCE(p_referral_percent,0) > 0 THEN
      v_ref_bonus := floor(v_tx.amount * p_referral_percent / 100);
      IF v_ref_bonus > 0 THEN
        UPDATE public.tg_users SET balance = balance + v_ref_bonus, referral_earned = referral_earned + v_ref_bonus WHERE id = v_referrer;
        INSERT INTO public.transactions (user_id, type, status, amount, admin_note, processed_at)
        VALUES (v_referrer, 'referral_bonus', 'approved', v_ref_bonus, 'Referal #' || v_tx.number, now());
      END IF;
    END IF;
  END IF;

  UPDATE public.transactions SET status = 'approved', processed_at = now(), admin_note = p_note WHERE id = v_tx.id
  RETURNING * INTO v_tx;
  RETURN v_tx;
END $$;

-- Atomic: so'rovni rad etish (ushlab qolingan pulni qaytarish)
CREATE OR REPLACE FUNCTION public.reject_transaction(p_tx_id uuid, p_note text)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx public.transactions;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_tx_id FOR UPDATE;
  IF v_tx.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_tx.status <> 'pending' THEN RAISE EXCEPTION 'already_processed'; END IF;
  IF v_tx.type IN ('card_withdraw','bk_deposit') THEN
    UPDATE public.tg_users SET balance = balance + v_tx.amount WHERE id = v_tx.user_id;
  END IF;
  UPDATE public.transactions SET status = 'rejected', processed_at = now(), admin_note = p_note WHERE id = v_tx.id
  RETURNING * INTO v_tx;
  RETURN v_tx;
END $$;

-- Atomic: admin balances tuzatishi
CREATE OR REPLACE FUNCTION public.adjust_balance(p_user_id bigint, p_delta bigint, p_note text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new bigint;
BEGIN
  UPDATE public.tg_users SET balance = balance + p_delta WHERE id = p_user_id RETURNING balance INTO v_new;
  IF v_new IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_new < 0 THEN RAISE EXCEPTION 'negative_balance'; END IF;
  INSERT INTO public.transactions (user_id, type, status, amount, admin_note, processed_at)
  VALUES (p_user_id, 'adjustment', 'approved', p_delta, p_note, now());
  RETURN v_new;
END $$;

-- Pul chiqarishdagi yuz surati (selfi)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS selfie_path text;
