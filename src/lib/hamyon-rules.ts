// HamyonAPI (hamyon-api.uz) automatic card payments — pure rules, covered by tests.
// One open payment per exact sum per shop, so a busy sum is moved up by 1 so'm.

/** Smallest sum ≥ `amount` that no other open payment uses (500000 → 500001 when taken). */
export function nextFreeAmount(amount: number, taken: Iterable<number>): number {
  const used = new Set(taken);
  let n = amount;
  while (used.has(n)) n++;
  return n;
}

/** HamyonAPI refused because another open payment already has this exact sum. */
export function isAmountBusyError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("summa") && (m.includes("ochiq") || m.includes("mavjud") || m.includes("band"));
}

/** Whole minutes shown to the customer — the real HamyonAPI time, never more (late money is lost). */
export function payMinutes(expiresInSec: number | null | undefined): number {
  const s = Number(expiresInSec);
  if (!Number.isFinite(s) || s <= 0) return 5;
  return Math.max(1, Math.floor(s / 60));
}

export type HamyonCallback = {
  paymentId: string;
  orderId: string;
  shopId: string;
  amount: string;
  status: "prepare" | "paid" | "cancel" | string;
  reason: string;
  sign: string;
};

/** Reads a prepare/complete callback body; null when required fields are missing. */
export function parseHamyonCallback(fields: Record<string, string | undefined>): HamyonCallback | null {
  const paymentId = (fields["payment_id"] ?? "").trim();
  const amount = (fields["amount"] ?? "").trim();
  const sign = (fields["sign"] ?? "").trim().toLowerCase();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(paymentId) || !/^\d{1,12}(\.\d{1,2})?$/.test(amount) || !/^[a-f0-9]{32}$/.test(sign)) return null;
  return {
    paymentId,
    orderId: (fields["order_id"] ?? "").trim().slice(0, 100),
    shopId: (fields["shop_id"] ?? "").trim().slice(0, 50),
    amount,
    status: (fields["status"] ?? "").trim().toLowerCase(),
    reason: (fields["reason"] ?? "").trim().slice(0, 100),
    sign,
  };
}

/** The exact text signed by HamyonAPI: md5(shop_id + payment_id + amount + shop_key). */
export function signSource(shopId: string, paymentId: string, amount: string, shopKey: string): string {
  return `${shopId}${paymentId}${amount}${shopKey}`;
}

/** Card as digits only, so one tap copies it. */
export const cardDigits = (card: string) => card.replace(/\D/g, "");

/** The payment message the customer sees (owner's wording; minutes come from HamyonAPI). */
export function payText(l: "uz" | "ru", pay: number, card: string, minutes: number): string {
  const c = cardDigits(card);
  if (l === "ru") {
    return [
      `👉🏻 Нужно перевести: <code>${pay}</code> сум`,
      `👉🏻 Карта: <code>${c}</code>`,
      "",
      `❗️ Даётся ${minutes} минут. После перевода деньги автоматически поступят на ваш счёт✅`,
      "",
      `⚠️🕝ПЕРЕВЕДИТЕ В ТЕЧЕНИЕ ${minutes} МИНУТ`,
      "",
      "❗️-Если разделите платёж на 2 части",
      "❗️-Если переведёте через банкомат или Paynet",
      "",
      "‼️Если ошибётесь: ДЕНЬГИ ПРОПАДУТ!",
    ].join("\n");
  }
  return [
    `👉🏻 O'tkazish kerak: <code>${pay}</code> so'm`,
    `👉🏻 Karta: <code>${c}</code>`,
    "",
    `❗️ ${minutes} daqiqa vaqt beriladi. Pul otkazilsa avtomatik hisobingizga tushadi✅`,
    "",
    `⚠️🕝${minutes} DAQIQA ICHIDA OTKAZISH SHART`,
    "",
    "❗️-Tolovni 2 ga bolib tashlagan bolsangiz",
    "❗️-Tolovni bankomat yoki Paynet butkadan tashlagan bolsangiz",
    "",
    "‼️Xato qilsangiz: PULINGIZGA KUYASIZ!",
  ].join("\n");
}
