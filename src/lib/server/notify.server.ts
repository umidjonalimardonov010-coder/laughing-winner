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

// New request → message to every admin chat id from settings.
export async function notifyAdminsNewRequest(tx: Tx) {
  if (telegramMode() === "none") return;
  try {
    const s = await getSettings();
    const ids = s.admin_chat_id.split(/[,\s]+/).filter(Boolean);
    if (!ids.length) return;
    const u = await maybeOne(
      sql<{ username: string | null; first_name: string | null }[]>`
        select username, first_name from public.tg_users where id = ${tx.user_id}`,
    );
    const lines = [
      `🆕 <b>Yangi so'rov #${tx.number}</b>`,
      TYPE_UZ[tx.type] ?? tx.type,
      `👤 ${escapeHtml(u?.first_name ?? "")} ${u?.username ? "@" + escapeHtml(u.username) : ""} (<code>${tx.user_id}</code>)`,
    ];
    if (tx.bookmaker_id) lines.push(`🏢 ${escapeHtml(await bkName(tx.bookmaker_id))}`);
    if (tx.account_id) lines.push(`🆔 ID: <code>${escapeHtml(tx.account_id)}</code>`);
    if (tx.withdraw_code) lines.push(`🔑 Kod: <code>${escapeHtml(tx.withdraw_code)}</code>`);
    if (tx.card_number) lines.push(`💳 Karta: <code>${escapeHtml(tx.card_number)}</code>`);
    if (tx.amount) lines.push(`💰 Summa: <b>${formatSom(tx.amount)} so'm</b>`);
    if (tx.bonus) lines.push(`🎁 Bonus: +${formatSom(tx.bonus)} so'm (BK hisobiga jami ${formatSom(tx.amount + tx.bonus)} so'm)`);
    if (tx.admin_note) lines.push(`💬 ${escapeHtml(tx.admin_note)}`);
    // A code withdrawal needs the amount typed in the panel; everything else can be decided right here.
    const needsAmount = tx.type === "bk_withdraw" && !tx.amount;
    if (needsAmount) lines.push("ℹ️ Summani admin panelda kiriting.");
    const base = publicBase(s);
    const adminUrl = base ? `${base}/admin/requests` : null;
    const receipt = tx.receipt_path && base ? await signedUrl("receipts", tx.receipt_path, 60 * 60 * 24, base) : null;
    const text = lines.join("\n");
    for (const chatId of ids) {
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
      await sendWithReceipt(chatId, text, receipt, tx.receipt_path ?? "", markup);
    }
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
