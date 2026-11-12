// Fixed video places. Admin uploads a file into each place; the label tells where it appears.
export type VideoSlot = {
  slot: string;
  group: "wallet" | "bot";
  order: number;
  title: { uz: string; ru: string; en: string };
  description: { uz: string; ru: string; en: string };
  where: string; // admin hint (Uzbek)
};

export const VIDEO_SLOTS: VideoSlot[] = [
  {
    slot: "guide_app",
    group: "wallet",
    order: 1,
    title: { uz: "Ilovadan qanday foydalanish", ru: "Как пользоваться приложением", en: "How to use the app" },
    description: {
      uz: "Ilova interfeysi va asosiy funksiyalarning qisqacha ko'rinishi",
      ru: "Краткий обзор интерфейса и основных функций",
      en: "A short tour of the interface and main features",
    },
    where: "WALLET ilovasi → \"Bu qanday ishlaydi\" → 1-video",
  },
  {
    slot: "guide_topup",
    group: "wallet",
    order: 2,
    title: { uz: "Balansni qanday to'ldirish", ru: "Как пополнить баланс", en: "How to top up the balance" },
    description: {
      uz: "Hamyoningizni to'ldirish bo'yicha bosqichma-bosqich qo'llanma",
      ru: "Пошаговая инструкция по пополнению кошелька",
      en: "Step-by-step guide to topping up your wallet",
    },
    where: "WALLET ilovasi → \"Bu qanday ishlaydi\" → 2-video",
  },
  {
    slot: "guide_card",
    group: "wallet",
    order: 3,
    title: { uz: "Kartaga qanday yechish", ru: "Как вывести на карту", en: "How to withdraw to a card" },
    description: {
      uz: "Hamyondan bank kartasiga mablag' o'tkazish usuli",
      ru: "Как перевести деньги из кошелька на банковскую карту",
      en: "How to move money from the wallet to a bank card",
    },
    where: "WALLET ilovasi → \"Bu qanday ishlaydi\" → 3-video",
  },
  {
    slot: "guide_bk_withdraw",
    group: "wallet",
    order: 4,
    title: {
      uz: "BK xizmatlaridan hamyonga mablag' yechish",
      ru: "Вывод из букмекера в кошелёк",
      en: "Withdraw from a bookmaker to the wallet",
    },
    description: {
      uz: "Bukmeker hisobidan kod orqali hamyonga pul chiqarish",
      ru: "Вывод с букмекерского счёта в кошелёк по коду",
      en: "Withdraw from a bookmaker account to the wallet with a code",
    },
    where: "WALLET ilovasi → \"Bu qanday ishlaydi\" → 4-video",
  },
  {
    slot: "bot_deposit",
    group: "bot",
    order: 5,
    title: { uz: "Hisobni to'ldirish videosi", ru: "Видео пополнения", en: "Deposit video" },
    description: { uz: "", ru: "", en: "" },
    where: "Bot chatida → \"📥 Hisobni to'ldirish\" tugmasi bosilganda chiqadi",
  },
  {
    slot: "bot_referral",
    group: "bot",
    order: 6,
    title: { uz: "Hamkorlik dasturi videosi", ru: "Видео партнёрской программы", en: "Referral video" },
    description: { uz: "", ru: "", en: "" },
    where: "Bot chatida → \"👥 Hamkorlik dasturi\" tugmasi bosilganda chiqadi",
  },
];

export const VIDEO_SLOT_IDS = VIDEO_SLOTS.map((v) => v.slot);
