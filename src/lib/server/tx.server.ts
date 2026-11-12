// One shape for a money operation, shared by the wallet and the admin panel.
// Big numbers come back as JS numbers, timestamps as plain ISO text.
import { sql, ts } from "./db.server";

export type TxType =
  | "wallet_topup"
  | "card_withdraw"
  | "bk_deposit"
  | "bk_withdraw"
  | "referral_bonus"
  | "adjustment";
export type TxStatus = "pending" | "approved" | "rejected";

export type TxRow = {
  id: string;
  number: number;
  user_id: number;
  type: TxType;
  status: TxStatus;
  amount: number;
  bonus: number;
  fee: number;
  bookmaker_id: string | null;
  account_id: string | null;
  withdraw_code: string | null;
  card_number: string | null;
  receipt_path: string | null;
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
};

export const TX_COLS = () => sql`id, number::float8 as number, user_id::float8 as user_id, type, status,
  amount::float8 as amount, bonus::float8 as bonus, fee::float8 as fee,
  bookmaker_id, account_id, withdraw_code, card_number, receipt_path, admin_note,
  ${ts("created_at")} as created_at, ${ts("processed_at")} as processed_at`;
