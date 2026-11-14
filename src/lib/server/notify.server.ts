import { maybeOne, sql } from "./db.server";
import { getSettings, publicBase } from "./settings.server";
import { signedUrl } from "./media.server";
import { escapeHtml, telegramMode, tg } from "./telegram.server";
import { formatSom, maskCard } from "@/lib/format";

type Tx = {
  id: string;
  number: number;
  user_id: number;
  type: string;
  status: string;
  amount: number;
  bonus: number;
  fee: number;
  bookmaker_id: string | null;
  account_id: string | null;
  withdraw_code: string | null;
  card_number: string | null;
  admin_note: string | null;
  receipt_path?: string | null;
};

const TYPE_UZ: Record<string, string> = {
  wallet_topup: "💳 Hamyonni to'ldirish",
  card_withdraw: "🏧 Kartaga yechish",
  bk_deposit: "📥 Bukmekerga to'ldirish",
  bk_withdraw: "📤 Bukmekerdan chiqarish",
  referral_bonus: "🎁 Referal bonus",
  adjustment: "✏️ Balans tuzatish",
};
const TYPE_RU: Record<string, string> = {
  wallet_topup: "💳 Пополнение кошелька",
  card_withdraw: "🏧 Вывод на карту",
  bk_deposit: "📥 Пополнение букмекера",
  bk_withdraw: "📤 Вывод из букмекера",
  referral_bonus: "🎁 Реферальный бонус",
  adjustment: "✏️ Корректировка",
};

async function bkName(id: string | null) {
  if (!id) return "";
  const rows = await sql<{ name: string }[]>`select name from public.bookmakers where id = ${id}`;
  return rows[0]?.name ?? id;
}

const LINE = "━━━━━━━━━━━━━━━━";

/** Tashkent time (UTC+5) — the server itself runs in UTC. */
function tashkentNow() {
  const d = new Date(Date.now() + 5 * 3600_000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** 9860606760806673 → 9860 6067 6080 6673 (still one tap to copy inside <code>). */
function cardGroups(card: string) {
  return card.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
}

function personLines(u: { first_name: string | null; last_name?: string | null; username: string | null; phone: string | null } | null, userId: number) {
  const name = [u?.first_name, u?.last_name].filter(Boolean).join(" ");
  return [
    `👤 <b>${escapeHtml(name || "—")}</b>${u?.username ? ` · @${escapeHtml(u.username)}` : ""}`,
    `🆔 <code>${userId}</code>   📱 <code>${escapeHtml(u?.phone ?? "—")}</code>`,
  ];
}

// New request → message to every admin chat id from settings (in the bot). Selfies go to the channel separately.
export async function notifyAdminsNewRequest(tx: Tx) {
  if (telegramMode() === "none") return;
  try {
    const s = await getSettings();
    const ids = s.admin_chat_id.split(/[,\s]+/).filter(Boolean);
    if (!ids.length) return;
    const u = await maybeOne(
      sql<{ username: string | null; first_name: string | null; last_name: string | null; phone: string | null }[]>`
        select username, first_name, last_name, phone from public.tg_users where id = ${tx.user_id}`,
    );
    const isWithdraw = tx.type === "card_withdraw" || tx.type === "bk_withdraw";
    const lines = [
      `${isWithdraw ? "📤" : "📥"} <b>YANGI SO'ROV #${tx.number}</b>`,
      `<i>${escapeHtml(TYPE_UZ[tx.type] ?? tx.type)}</i>`,
      LINE,
      ...personLines(u, tx.user_id),
      LINE,
    ];
    if (tx.bookmaker_id) lines.push(`🏢 Bukmeker: <b>${escapeHtml(await bkName(tx.bookmaker_id))}</b>`);
    if (tx.account_id) lines.push(`🎯 Hisob ID: <code>${escapeHtml(tx.account_id)}</code>`);
    if (tx.withdraw_code) lines.push(`🔑 Kod: <code>${escapeHtml(tx.withdraw_code)}</code>`);
    if (tx.card_number) lines.push(`💳 Karta: <code>${cardGroups(tx.card_number)}</code>`);
    if (tx.amount) lines.push(`💰 Summa: <b>${formatSom(tx.amount)} so'm</b>`);
    if (tx.bonus) lines.push(`🎁 Bonus: +${formatSom(tx.bonus)} so'm (BK hisobiga jami <b>${formatSom(tx.amount + tx.bonus)} so'm</b>)`);
    if (tx.admin_note) lines.push(`💬 ${escapeHtml(tx.admin_note)}`);
    // A code withdrawal needs the amount typed in the panel; everything else can be decided right here.
    const needsAmount = tx.type === "bk_withdraw" && !tx.amount;
    if (needsAmount) lines.push("ℹ️ Summani admin panelda kiriting.");
    lines.push(LINE, `🕒 ${tashkentNow()}`);
    if (isWithdraw) lines.push(s.selfie_channel_id.trim() ? "🤳 Yuz surati — selfi kanalida" : "⚠️ Selfi kanali ulanmagan — /kanal");
    const base = publicBase(s);
    const adminUrl = base ? `${base}/admin/requests` : null;
    const receipt = tx.receipt_path && base ? await signedUrl("receipts", tx.receipt_path, 60 * 60 * 24, base) : null;
    const text = lines.join("\n");
    await Promise.all(
      ids.map((chatId) => {
        const keyboard: unknown[][] = [];
        if ((tx.status ?? "pending") === "pending" && !needsAmount) {
          keyboard.push([
            { text: "✅ Tasdiqlash", callback_data: `adm:ok:${tx.id}` },
            { text: "❌ Rad etish", callback_data: `adm:no:${tx.id}` },
          ]);
        }
        if (adminUrl) {
          // Inside Telegram the panel opens already signed in (private chats only support web_app buttons).
          keyboard.push([
            Number(chatId) > 0
              ? { text: "🛠 Admin panelda ochish", web_app: { url: adminUrl } }
              : { text: "🛠 Admin panelda ochish", url: adminUrl },
          ]);
        }
        const markup = keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : {};
        return sendWithReceipt(chatId, text, receipt, tx.receipt_path ?? "", markup).catch((e) =>
          console.error("notifyAdminsNewRequest send", chatId, e),
        );
      }),
    );
  } catch (e) {
    console.error("notifyAdminsNewRequest", e);
  }
}

// Approved / rejected → message to the user.
export async function notifyUserStatus(tx: Tx) {
  if (telegramMode() === "none") return;
  try {
    const u = await maybeOne(
      sql<{ lang: string; balance: number }[]>`
        select lang, balance::float8 as balance from public.tg_users where id = ${tx.user_id}`,
    );
    const ru = u?.lang === "ru";
    const title = (ru ? TYPE_RU : TYPE_UZ)[tx.type] ?? tx.type;
    const ok = tx.status === "approved";
    const lines = [
      ok
        ? ru
          ? `✅ <b>Заявка #${tx.number} выполнена</b>`
          : `✅ <b>So'rov #${tx.number} bajarildi</b>`
        : ru
          ? `❌ <b>Заявка #${tx.number} отклонена</b>`
          : `❌ <b>So'rov #${tx.number} rad etildi</b>`,
      title,
    ];
    if (tx.bookmaker_id) lines.push(`🏢 ${escapeHtml(await bkName(tx.bookmaker_id))}`);
    if (tx.card_number) lines.push(`💳 ${maskCard(tx.card_number)}`);
    if (tx.amount) lines.push(`💰 ${formatSom(tx.amount)} ${ru ? "сум" : "so'm"}`);
    if (tx.admin_note) lines.push(`💬 ${escapeHtml(tx.admin_note)}`);
    lines.push(`${ru ? "Баланс" : "Balans"}: ${formatSom(u?.balance ?? 0)} ${ru ? "сум" : "so'm"}`);
    await tg("sendMessage", { chat_id: tx.user_id, text: lines.join("\n"), parse_mode: "HTML" });
  } catch (e) {
    console.error("notifyUserStatus", e);
  }
}

// The receipt photo goes with the alert so the admin can check the payment in Telegram.
async function sendWithReceipt(chatId: string, text: string, receiptUrl: string | null, path: string, markup: object) {
  if (receiptUrl) {
    const isPdf = /\.pdf$/i.test(path);
    const tries: [string, Record<string, unknown>][] = isPdf
      ? [["sendDocument", { document: receiptUrl }]]
      : [
          ["sendPhoto", { photo: receiptUrl }],
          ["sendDocument", { document: receiptUrl }],
        ];
    for (const [method, media] of tries) {
      try {
        await tg(method, { chat_id: chatId, caption: text, parse_mode: "HTML", ...media, ...markup });
        return;
      } catch {
        // try the next way, then plain text
      }
    }
  }
  await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...markup }).catch(() => undefined);
}

// Withdrawal selfie → only the private selfie channel (settings: selfie_channel_id); the request itself goes to the bot.
// Re-reads the request so the final amount (known after an automatic payout) goes in the caption.
export async function notifyWithdrawSelfie(txId: string) {
  if (telegramMode() === "none") return;
  try {
    const s = await getSettings();
    const channel = s.selfie_channel_id.trim();
    if (!channel) return;
    const r = await maybeOne(
      sql<
        {
          number: number;
          type: string;
          status: string;
          amount: number;
          account_id: string | null;
          card_number: string | null;
          bookmaker_id: string | null;
          selfie_path: string | null;
          user_id: number;
          first_name: string | null;
          last_name: string | null;
          username: string | null;
          phone: string | null;
        }[]
      >`
        select t.number::float8 as number, t.type, t.status, t.amount::float8 as amount, t.account_id, t.card_number,
          t.bookmaker_id, t.selfie_path, u.id::float8 as user_id, u.first_name, u.last_name, u.username, u.phone
        from public.transactions t join public.tg_users u on u.id = t.user_id
        where t.id = ${txId}`,
    );
    if (!r?.selfie_path) return;
    const status: Record<string, string> = { pending: "⏳ Kutilmoqda", approved: "✅ Bajarildi", rejected: "❌ Rad etildi" };
    const lines = [
      `🤳 <b>YUZ TASDIQI · SO'ROV #${r.number}</b>`,
      `<i>${escapeHtml(TYPE_UZ[r.type] ?? r.type)}</i>`,
      LINE,
      ...personLines(r, r.user_id),
      LINE,
    ];
    if (r.bookmaker_id) lines.push(`🏢 Bukmeker: <b>${escapeHtml(await bkName(r.bookmaker_id))}</b>`);
    if (r.account_id) lines.push(`🎯 Hisob ID: <code>${escapeHtml(r.account_id)}</code>`);
    if (r.card_number) lines.push(`💳 Karta: <code>${cardGroups(r.card_number)}</code>`);
    lines.push(r.amount ? `💰 Summa: <b>${formatSom(r.amount)} so'm</b>` : "💰 Summa: kod bo'yicha (hali aniqlanmagan)");
    lines.push(`📌 Holat: ${status[r.status] ?? r.status}`, LINE, `🕒 ${tashkentNow()}`);
    const base = publicBase(s);
    const photo = base ? await signedUrl("receipts", r.selfie_path, 60 * 60 * 24, base) : null;
    await sendWithReceipt(channel, lines.join("\n"), photo, r.selfie_path, {});
  } catch (e) {
    console.error("notifyWithdrawSelfie", e);
  }
}

/** Telegram alerts run after the reply, so the wallet answers at once instead of waiting for photo uploads. */
export function inBackground(label: string, job: () => Promise<unknown>) {
  void job().catch((e) => console.error(label, e));
}
