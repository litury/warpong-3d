/** Minimal i18n for Yandex Games SDK language requirement (2.14) */

const translations: Record<string, Record<string, string>> = {
  ru: {
    title: "ПОНГ 3D",
    solo: "СОЛО",
    online_soon: "ОНЛАЙН (СКОРО)",
    play_again: "ИГРАТЬ СНОВА",
    you_win: "ПОБЕДА!",
    you_lose: "ПОРАЖЕНИЕ!",
    loading: "Загрузка...",
    coins: "Монеты",
    connecting: "Подключение...",
    waiting: "Ожидание соперника...",
    no_opponent: "Соперник не найден. Попробуйте позже.",
    matching: "Поиск...",
  },
  en: {
    title: "PONG 3D",
    solo: "SOLO",
    online_soon: "ONLINE (SOON)",
    play_again: "PLAY AGAIN",
    you_win: "YOU WIN!",
    you_lose: "YOU LOSE!",
    loading: "Loading...",
    coins: "Coins",
    connecting: "Connecting...",
    waiting: "Waiting for opponent...",
    no_opponent: "No opponent found. Try again later.",
    matching: "Matching...",
  },
};

let currentLang = "ru";

export function setLang(lang: string) {
  currentLang = translations[lang] ? lang : "ru";
}

export function t(key: string): string {
  return translations[currentLang]?.[key] ?? translations.en[key] ?? key;
}
