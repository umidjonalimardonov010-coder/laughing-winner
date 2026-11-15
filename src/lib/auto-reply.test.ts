import { describe, expect, it } from "vitest";
import { matchReply, replyText, type AutoReply } from "./auto-reply";

const r = (id: string, keywords: string, extra: Partial<AutoReply> = {}): AutoReply => ({
  id,
  keywords,
  question_uz: `Savol ${id}`,
  answer_uz: `Javob ${id}`,
  question_ru: "",
  answer_ru: "",
  question_en: "",
  answer_en: "",
  sort_order: 0,
  is_active: true,
  ...extra,
});

describe("auto replies", () => {
  const list = [r("time", "qancha vaqt, necha daqiqa, сколько времени"), r("card", "karta, kartaga"), r("off", "karta", { is_active: false })];
  it("answers by keyword, ignoring case and apostrophe style", () => {
    expect(matchReply("Pul QANCHA vaqtda tushadi?", list)?.id).toBe("time");
    expect(matchReply("Сколько времени ждать?", list)?.id).toBe("time");
  });
  it("switched-off replies are never used", () => {
    expect(matchReply("karta", [list[2]!])).toBeNull();
  });
  it("no keyword → no auto answer", () => {
    expect(matchReply("salom", list)).toBeNull();
  });
  it("falls back to Uzbek when the user's language is empty", () => {
    expect(replyText(list[0]!, "ru")).toEqual({ q: "Savol time", a: "Javob time" });
  });
});
