type Locale = "ru" | "en";

const en: Record<string, string> = {
  // Menu
  "menu.title": "PONG",
  "menu.play": "PLAY",
  "menu.online": "ONLINE",
  "menu.shop": "SHOP",

  "menu.onlineCount": "Online: {count}",

  // HUD
  "hud.badge.spd": "SPD",
  "hud.badge.size": "SIZE",
  "hud.badge.ball": "BALL",
  "hud.stake": "Stake: {amount}",
  "hud.streak": "Streak: {count}",

  // Game Over
  "gameover.win": "YOU WIN!",
  "gameover.lose": "YOU LOSE",
  "gameover.coins": "+{earned} coins (total: {total})",
  "gameover.playAgain": "PLAY AGAIN",
  "gameover.newOpponent": "NEW OPPONENT",
  "gameover.watchAd": "WATCH AD +15",
  "gameover.menu": "MENU",
  "gameover.leaderboard": "Leaderboard",
  "gameover.coinsLabel": "coins",
  "gameover.total": "total",
  "gameover.streak": "Win streak: {count}!",

  // VS
  "vs.you": "YOU",
  "vs.stake": "Stake: {amount} coins",

  // Online
  "online.insufficientFunds": "Not enough coins! You need 10 coins to play online.",

  // Lobby
  "lobby.connecting": "Connecting...",
  "lobby.searching": "Searching for opponent...",
  "lobby.cancel": "CANCEL",
  "lobby.stake": "Stake: {amount} coins",
  "lobby.timer": "Search: {time}",

  // Shop
  "shop.title": "SHOP",
  "shop.coins": "Coins: {count}",
  "shop.buy": "Buy ({price})",
  "shop.upgrade": "Upgrade ({price})",
  "shop.equip": "Equip",
  "shop.equipped": "Equipped",
  "shop.max": "MAX",
  "shop.back": "BACK",
  "shop.cat.Gameplay": "Gameplay",
  "shop.cat.PaddleColor": "Paddle Colors",
  "shop.cat.BallTrail": "Ball Trails",
  "shop.cat.BallVisual": "Ball Visual",

  // Shop tabs
  "shop.tab.gameplay": "Gameplay",
  "shop.tab.cosmetics": "Cosmetics",

  // Shop items
  "shop.item.PaddleSpeed.name": "Swift Paddle",
  "shop.item.PaddleSpeed.desc": "+50 paddle speed per level",
  "shop.item.PaddleSize.name": "Big Paddle",
  "shop.item.PaddleSize.desc": "+15px paddle height per level",
  "shop.item.BallStartSpeed.name": "Fast Start",
  "shop.item.BallStartSpeed.desc": "+30 initial ball speed per level",
  "shop.item.StickyPaddle.name": "Sticky Paddle",
  "shop.item.StickyPaddle.desc": "Ball clings to paddle for 0.3s on hit",
  "shop.item.ColorNeonGreen.name": "Neon Green",
  "shop.item.ColorNeonGreen.desc": "Green paddle glow",
  "shop.item.ColorNeonBlue.name": "Neon Blue",
  "shop.item.ColorNeonBlue.desc": "Blue paddle glow",
  "shop.item.ColorHotPink.name": "Hot Pink",
  "shop.item.ColorHotPink.desc": "Pink paddle glow",
  "shop.item.ColorGold.name": "Gold",
  "shop.item.ColorGold.desc": "Golden paddle",
  "shop.item.TrailSimple.name": "Basic Trail",
  "shop.item.TrailSimple.desc": "Simple fading trail behind the ball",
  "shop.item.TrailRainbow.name": "Rainbow Trail",
  "shop.item.TrailRainbow.desc": "Colorful rainbow trail",
  "shop.item.BallGlow.name": "Ball Glow",
  "shop.item.BallGlow.desc": "Glowing ball effect",

  // Orientation
  "orientation.hint": "↻ Rotate for best experience",
};

const ru: Record<string, string> = {
  // Меню
  "menu.title": "ПОНГ",
  "menu.play": "ИГРАТЬ",
  "menu.online": "ОНЛАЙН",
  "menu.shop": "МАГАЗИН",

  "menu.onlineCount": "Онлайн: {count}",

  // HUD
  "hud.badge.spd": "СКР",
  "hud.badge.size": "РАЗМ",
  "hud.badge.ball": "МЯЧ",
  "hud.stake": "Ставка: {amount}",
  "hud.streak": "Серия: {count}",

  // Конец игры
  "gameover.win": "ПОБЕДА!",
  "gameover.lose": "ПОРАЖЕНИЕ",
  "gameover.coins": "+{earned} монет (всего: {total})",
  "gameover.playAgain": "ИГРАТЬ СНОВА",
  "gameover.newOpponent": "НОВЫЙ СОПЕРНИК",
  "gameover.watchAd": "РЕКЛАМА +15",
  "gameover.menu": "МЕНЮ",
  "gameover.leaderboard": "Рейтинг",
  "gameover.coinsLabel": "монет",
  "gameover.total": "всего",
  "gameover.streak": "Серия побед: {count}!",

  // VS
  "vs.you": "ВЫ",
  "vs.stake": "Ставка: {amount} монет",

  // Онлайн
  "online.insufficientFunds": "Недостаточно монет! Нужно 10 монет для онлайн-игры.",

  // Лобби
  "lobby.connecting": "Подключение...",
  "lobby.searching": "Поиск соперника...",
  "lobby.cancel": "ОТМЕНА",
  "lobby.stake": "Ставка: {amount} монет",
  "lobby.timer": "Поиск: {time}",

  // Магазин
  "shop.title": "МАГАЗИН",
  "shop.coins": "Монеты: {count}",
  "shop.buy": "Купить ({price})",
  "shop.upgrade": "Улучшить ({price})",
  "shop.equip": "Выбрать",
  "shop.equipped": "Выбрано",
  "shop.max": "МАКС",
  "shop.back": "НАЗАД",
  "shop.cat.Gameplay": "Геймплей",
  "shop.cat.PaddleColor": "Цвета ракетки",
  "shop.cat.BallTrail": "Следы мяча",
  "shop.cat.BallVisual": "Визуал мяча",

  // Табы магазина
  "shop.tab.gameplay": "Геймплей",
  "shop.tab.cosmetics": "Косметика",

  // Товары магазина
  "shop.item.PaddleSpeed.name": "Быстрая ракетка",
  "shop.item.PaddleSpeed.desc": "+50 к скорости ракетки за уровень",
  "shop.item.PaddleSize.name": "Большая ракетка",
  "shop.item.PaddleSize.desc": "+15px к высоте ракетки за уровень",
  "shop.item.BallStartSpeed.name": "Быстрый старт",
  "shop.item.BallStartSpeed.desc": "+30 к начальной скорости мяча за уровень",
  "shop.item.StickyPaddle.name": "Липкая ракетка",
  "shop.item.StickyPaddle.desc": "Мяч прилипает к ракетке на 0.3с",
  "shop.item.ColorNeonGreen.name": "Неон зелёный",
  "shop.item.ColorNeonGreen.desc": "Зелёное свечение ракетки",
  "shop.item.ColorNeonBlue.name": "Неон синий",
  "shop.item.ColorNeonBlue.desc": "Синее свечение ракетки",
  "shop.item.ColorHotPink.name": "Ярко-розовый",
  "shop.item.ColorHotPink.desc": "Розовое свечение ракетки",
  "shop.item.ColorGold.name": "Золото",
  "shop.item.ColorGold.desc": "Золотая ракетка",
  "shop.item.TrailSimple.name": "Простой след",
  "shop.item.TrailSimple.desc": "Затухающий след за мячом",
  "shop.item.TrailRainbow.name": "Радужный след",
  "shop.item.TrailRainbow.desc": "Разноцветный радужный след",
  "shop.item.BallGlow.name": "Свечение мяча",
  "shop.item.BallGlow.desc": "Эффект свечения мяча",

  // Ориентация
  "orientation.hint": "↻ Поверните экран для лучшего опыта",
};

const translations: Record<Locale, Record<string, string>> = { en, ru };

let current: Locale = "en";

export function setLocale(lang: string) {
  current = lang in translations ? (lang as Locale) : "en";
}

export function getLocale(): Locale {
  return current;
}

export function t(key: string, params?: Record<string, string | number>): string {
  let str = translations[current][key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{${k}}`, String(v));
    }
  }
  return str;
}

export function applyDomTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n")!);
  });
}
