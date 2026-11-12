export function formatSom(n: number | null | undefined): string {
  const v = Math.round(Number(n ?? 0));
  return v.toLocaleString("ru-RU").replace(/,/g, " ").replace(/\u00a0/g, " ");
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function maskCard(card: string | null | undefined): string {
  const c = (card ?? "").replace(/\D/g, "");
  if (c.length < 8) return c;
  return `${c.slice(0, 4)} **** **** ${c.slice(-4)}`;
}

export function groupCard(card: string | null | undefined): string {
  return (card ?? "").replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
}

export type TxType =
  | "wallet_topup"
  | "card_withdraw"
  | "bk_deposit"
  | "bk_withdraw"
  | "referral_bonus"
  | "adjustment";
export type TxStatus = "pending" | "approved" | "rejected";

// "Kirim" = money coming into the user's wallet, "Chiqim" = money leaving it.
export function txDirection(type: TxType, amount = 0): "in" | "out" {
  if (type === "card_withdraw" || type === "bk_deposit") return "out";
  if (type === "adjustment") return amount < 0 ? "out" : "in";
  return "in";
}
