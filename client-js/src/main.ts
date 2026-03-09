import { Application } from "pixi.js";
import { ARENA_WIDTH, ARENA_HEIGHT, PADDLE_HEIGHT } from "./config";
import { GameState, GameMode } from "./config/states";
import { Game, InputManager } from "./modules/game";
import { loadGameAssets } from "./modules/game/assets";
import type { GameAssets } from "./modules/game/assets";
import { WsClient, processServerMessages } from "./modules/network";
import type { MatchResult, PlayerSyncData } from "./modules/network";
import {
  showScreen, updateHudScore, updateHudUpgrades, updateHudOpponentInfo,
  updateHudStake, updateHudStreak,
  setupGameOver, showVsScreen, renderShop,
  updateLobbyStatus, updateLobbyStake, updateLobbyTimer, updateLobbyTip,
  updateMenuOnlineCount, updateMenuCoins, updateMenuMmr,
  showQuickChatBar, showChatBubble, setupQuickChatButtons,
} from "./modules/ui";
import {
  createDefaultWallet, createDefaultOwned, createDefaultEquipped,
  getLevel, UpgradeId, UpgradeCategory,
} from "./modules/shop/parts/data";
import { computeEffectiveStats, awardCoins, getPaddleColor, getTrailType } from "./modules/shop";
import { YandexSdk } from "./modules/yandex";
import { setLocale, applyDomTranslations, t } from "./i18n";

// --- Constants ---
const STAKE = 10;

// --- State ---
let state = GameState.Menu;
let mode = GameMode.Solo;
let game: Game | null = null;
let input: InputManager;
const ws = new WsClient();
const sdk = new YandexSdk();
const matchResult: MatchResult = { playerSide: null, winner: null, opponentCosmetics: null, opponentUpgrades: null, opponentName: null, stake: null, reward: null, coins: null, mmr: null, opponentMmr: null, mmrChange: null };
let gameAssets: GameAssets | null = null;
let lastCoinsEarned = 0;
let onlineCount = 0;
let lobbyTimerInterval: ReturnType<typeof setInterval> | null = null;
let lobbySeconds = 0;

const wallet = createDefaultWallet();
const owned = createDefaultOwned();
const equipped = createDefaultEquipped();
let totalOnlineWins = 0;
let winStreak = 0;
let playerMmr: number | null = null;

// --- Lobby tips ---
const TIPS_EN = [
  "The ball speeds up with each paddle hit!",
  "Hit the ball with the edge of your paddle to change its angle.",
  "Upgrades from the shop work in online matches too!",
  "Win streaks give you bonus coins!",
];
const TIPS_RU = [
  "Мяч ускоряется с каждым ударом ракетки!",
  "Ударьте мячом по краю ракетки, чтобы изменить угол.",
  "Улучшения из магазина работают и в онлайн-матчах!",
  "Серия побед даёт бонусные монеты!",
];

function getRandomTip(): string {
  const tips = t("menu.title") === "ПОНГ" ? TIPS_RU : TIPS_EN;
  return tips[Math.floor(Math.random() * tips.length)];
}

// --- PlayerSync handler ---
function handlePlayerSync(data: PlayerSyncData) {
  wallet.coins = data.coins;
  playerMmr = data.mmr;
  totalOnlineWins = data.totalOnlineWins;
  winStreak = data.winStreak;

  // Sync upgrades
  for (const [key, level] of Object.entries(data.upgrades)) {
    owned.levels[key] = level;
  }

  // Sync cosmetics
  equipped.paddleColor = data.paddleColor as UpgradeId | null;
  equipped.ballTrail = data.ballTrail as UpgradeId | null;

  updateMenuCoins(wallet.coins);
  updateMenuMmr(playerMmr);
  console.log("[sync] PlayerSync: coins:", data.coins, "mmr:", data.mmr);
}

// --- PixiJS init ---
const app = new Application();

async function main() {
  await app.init({
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    backgroundColor: 0x000000,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  const canvas = app.canvas as HTMLCanvasElement;
  document.getElementById("app")!.prepend(canvas);
  input = new InputManager(canvas);

  // Responsive canvas scaling
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  window.visualViewport?.addEventListener("resize", resizeCanvas);

  // Center the coordinate system (0,0 at center like Bevy)
  // Flip Y so positive Y = up (matching Bevy's coordinate system)
  app.stage.x = ARENA_WIDTH / 2;
  app.stage.y = ARENA_HEIGHT / 2;
  app.stage.scale.y = -1;

  // Load game assets
  try {
    gameAssets = await loadGameAssets();
    console.log("[assets] Loaded mech, projectile, arena background");
  } catch (e) {
    console.warn("[assets] Failed to load game assets, using fallback graphics:", e);
  }

  // Init Yandex SDK (for ads, IAP, language)
  // WS connect happens after player_info is received (see onPlayerInfo below)
  sdk.init();

  // Wire up UI buttons
  setupButtons();

  // Show menu
  setState(GameState.Menu);

  // Game loop
  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime / 60; // Convert to seconds

    // Poll SDK (ads, IAP, language only)
    sdk.pollInbox({
      onInitOk: (lang) => {
        setLocale(lang);
        applyDomTranslations();
        updateMenuCoins(wallet.coins);
      },
      onPlayerInfo: (info) => {
        ws.setAuthPayload({
          signature: info.signature,
          uniqueId: info.id,
          name: info.name,
        });
        ws.connectPassive();
      },
      onRewardedGranted: () => {
        // Tell server to add coins
        ws.send({ type: "RewardCoins", amount: 15 });
      },
      onLeaderboardEntries: (entries) => {
        if (state === GameState.GameOver) {
          const isOnline = mode === GameMode.Online;
          const playerWon = isOnline
            ? matchResult.winner === matchResult.playerSide
            : (game?.score.left ?? 0) > (game?.score.right ?? 0);
          setupGameOver(playerWon, lastCoinsEarned, wallet.coins, isOnline, entries, winStreak, matchResult.mmr, matchResult.mmrChange);
        }
      },
      onPurchaseOk: (productId, token) => {
        ws.send({ type: "PurchaseCoins", productId });
        window.ysdk_consume_purchase(token);
        console.log("[iap] purchased", productId);
      },
    });

    // Process network messages
    if (ws.connected) {
      processServerMessages(ws, game, matchResult, {
        onPlayerSync: handlePlayerSync,
        onQueueJoined: () => updateLobbyStatus(t("lobby.searching")),
        onMatchFound: (side) => {
          matchResult.playerSide = side;
          playerMmr = matchResult.mmr;
          stopLobbyTimer();
          const playerName = t("vs.you");
          const opponentName = matchResult.opponentName ?? "???";
          const stake = matchResult.stake ?? STAKE;
          showVsScreen(playerName, opponentName, stake, matchResult.mmr, matchResult.opponentMmr);
          state = GameState.Playing;
          setTimeout(() => {
            startGame(GameMode.Online);
          }, 2500);
        },
        onGameOver: (winner) => {
          matchResult.winner = winner;
          if (game) game.setGameOver();
          finishGame();
        },
        onOpponentDisconnected: () => {
          if (game) game.setGameOver();
          finishGame();
        },
        onScoreUpdate: (left, right) => {
          updateHudScore(left, right);
        },
        onOnlineCount: (count) => {
          onlineCount = count;
          updateMenuOnlineCount(count);
        },
        onOpponentChat: (chatId) => {
          showChatBubble(chatId);
        },
      });

      // Send input to server in online mode
      if (state === GameState.Playing && mode === GameMode.Online) {
        ws.send({ type: "PlayerInput", direction: input.getNetworkDirection() });
      }
    }

    // Update game
    if (game && state === GameState.Playing) {
      game.update(dt);
    }
  });
}

function resizeCanvas() {
  const canvas = app.canvas as HTMLCanvasElement;
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const gameAspect = ARENA_WIDTH / ARENA_HEIGHT;
  const viewAspect = vw / vh;

  let scale: number;
  if (viewAspect > gameAspect) {
    scale = vh / ARENA_HEIGHT;
  } else {
    scale = vw / ARENA_WIDTH;
  }

  canvas.style.width = `${ARENA_WIDTH * scale}px`;
  canvas.style.height = `${ARENA_HEIGHT * scale}px`;

  const hint = document.getElementById("orientation-hint");
  if (hint) hint.style.display = vh > vw ? "block" : "none";
}

function setState(newState: GameState) {
  state = newState;

  switch (state) {
    case GameState.Menu:
      showScreen("screen-menu");
      updateMenuCoins(wallet.coins);
      updateMenuMmr(playerMmr);
      updateMenuOnlineCount(onlineCount);
      break;
    case GameState.Playing:
      showScreen("screen-hud");
      updateHudUpgrades(owned);
      if (mode === GameMode.Online) {
        updateHudStake(matchResult.stake ?? STAKE);
        updateHudStreak(winStreak);
        updateHudOpponentInfo(matchResult.opponentUpgrades, matchResult.opponentMmr);
        showQuickChatBar(true);
      } else {
        updateHudStake(null);
        updateHudStreak(0);
        updateHudOpponentInfo(null, null);
        showQuickChatBar(false);
      }
      break;
    case GameState.GameOver:
      showScreen("screen-game-over");
      break;
    case GameState.Lobby:
      showScreen("screen-lobby");
      updateLobbyStatus(t("lobby.connecting"));
      updateLobbyStake(STAKE);
      updateLobbyTip(getRandomTip());
      startLobbyTimer();
      break;
    case GameState.Shop:
      showScreen("screen-shop");
      refreshShop();
      break;
  }
}

function startLobbyTimer() {
  lobbySeconds = 0;
  updateLobbyTimer(0);
  lobbyTimerInterval = setInterval(() => {
    lobbySeconds++;
    updateLobbyTimer(lobbySeconds);
  }, 1000);
}

function stopLobbyTimer() {
  if (lobbyTimerInterval) {
    clearInterval(lobbyTimerInterval);
    lobbyTimerInterval = null;
  }
}

function resetMatchResult() {
  matchResult.playerSide = null;
  matchResult.winner = null;
  matchResult.opponentCosmetics = null;
  matchResult.opponentUpgrades = null;
  matchResult.opponentName = null;
  matchResult.stake = null;
  matchResult.reward = null;
  matchResult.coins = null;
  matchResult.mmr = null;
  matchResult.opponentMmr = null;
  matchResult.mmrChange = null;
}

function startGame(gameMode: GameMode) {
  mode = gameMode;
  matchResult.winner = null;
  matchResult.reward = null;

  if (game) {
    game.destroy();
    game = null;
  }

  const stats = computeEffectiveStats(owned);
  const paddleColor = getPaddleColor(equipped);
  const trailType = getTrailType(equipped);
  const myBallGlow = getLevel(owned, UpgradeId.BallGlow) > 0;
  const opCos = matchResult.opponentCosmetics;
  const opUpg = matchResult.opponentUpgrades;

  game = new Game(app.stage, input);
  game.assets = gameAssets;
  game.stats = stats;
  game.paddleColor = paddleColor;
  game.opponentPaddleColor = opCos?.paddleColor ?? 0xffffff;
  game.opponentPaddleHeight = PADDLE_HEIGHT + (opUpg?.paddleSizeLevel ?? 0) * 15;
  game.trailType = trailType;
  game.paddleSpeedLevel = getLevel(owned, UpgradeId.PaddleSpeed);
  game.ballGlow = myBallGlow || (opCos?.ballGlow ?? false);
  game.mode = gameMode;
  game.playerSide = matchResult.playerSide;

  game.onScore = () => {
    if (game) updateHudScore(game.score.left, game.score.right);
  };

  game.onGameOver = () => {
    finishGame();
  };

  game.setup();
  setState(GameState.Playing);
  updateHudScore(0, 0);
}

function finishGame() {
  const isOnline = mode === GameMode.Online;
  const playerWon = isOnline
    ? matchResult.winner === matchResult.playerSide
    : (game?.score.left ?? 0) > (game?.score.right ?? 0);

  if (isOnline && matchResult.mmr != null) {
    playerMmr = matchResult.mmr;
  }

  if (isOnline && matchResult.coins != null) {
    // Server already updated DB — just sync local state
    wallet.coins = matchResult.coins;
    lastCoinsEarned = matchResult.reward ?? 0;
    if (playerWon) {
      winStreak++;
      totalOnlineWins++;
    } else {
      winStreak = 0;
    }
  } else {
    // Solo mode: local reward
    lastCoinsEarned = awardCoins(wallet, mode, playerWon);
  }

  sdk.showFullscreenAd();

  game?.playGameOverAnimation(playerWon);

  setTimeout(() => {
    setupGameOver(playerWon, lastCoinsEarned, wallet.coins, isOnline, sdk.leaderboardEntries, winStreak, matchResult.mmr, matchResult.mmrChange);
    setState(GameState.GameOver);
  }, 1500);
}

function refreshShop() {
  renderShop(wallet, owned, equipped, {
    onBuy: (id) => {
      // Send purchase request to server
      ws.send({ type: "BuyUpgrade", upgradeId: id });
    },
    onEquip: (id) => {
      const upgradeId = id as UpgradeId;
      const def = CATALOG_MAP[upgradeId];
      if (!def) return;
      const slot = def === "PaddleColor" ? "paddleColor" as const : "ballTrail" as const;
      ws.send({ type: "EquipCosmetic", slot, itemId: id });
    },
  });
}

// Map upgrade IDs to their equip slot
import { CATALOG } from "./modules/shop/parts/catalog";
const CATALOG_MAP: Record<string, string> = {};
for (const item of CATALOG) {
  if (item.category === UpgradeCategory.PaddleColor) CATALOG_MAP[item.id] = "PaddleColor";
  else if (item.category === UpgradeCategory.BallTrail) CATALOG_MAP[item.id] = "BallTrail";
}

function setupButtons() {
  document.getElementById("btn-play")?.addEventListener("click", () => {
    resetMatchResult();
    startGame(GameMode.Solo);
  });

  document.getElementById("btn-online")?.addEventListener("click", () => {
    if (wallet.coins < STAKE) {
      alert(t("online.insufficientFunds"));
      return;
    }
    resetMatchResult();
    setState(GameState.Lobby);
    ws.joinQueue();
  });

  document.getElementById("btn-shop")?.addEventListener("click", () => {
    setState(GameState.Shop);
  });

  document.getElementById("btn-play-again")?.addEventListener("click", () => {
    if (game) { game.destroy(); game = null; }
    resetMatchResult();
    startGame(GameMode.Solo);
  });

  document.getElementById("btn-new-opponent")?.addEventListener("click", () => {
    if (game) { game.destroy(); game = null; }
    if (wallet.coins < STAKE) {
      alert(t("online.insufficientFunds"));
      setState(GameState.Menu);
      return;
    }
    ws.send({ type: "LeaveQueue" });
    resetMatchResult();
    setState(GameState.Lobby);
    ws.joinQueue();
  });

  document.getElementById("btn-watch-ad")?.addEventListener("click", () => {
    sdk.showRewardedVideo();
  });

  document.getElementById("btn-menu-from-gameover")?.addEventListener("click", () => {
    if (game) { game.destroy(); game = null; }
    setState(GameState.Menu);
  });

  document.getElementById("btn-cancel-lobby")?.addEventListener("click", () => {
    ws.send({ type: "LeaveQueue" });
    stopLobbyTimer();
    setState(GameState.Menu);
  });

  document.getElementById("btn-shop-back")?.addEventListener("click", () => {
    setState(GameState.Menu);
  });

  // Quick chat
  setupQuickChatButtons((chatId) => {
    ws.send({ type: "QuickChat", chatId: chatId as import("./shared/messages").QuickChatId });
  });
}

main().catch(console.error);
