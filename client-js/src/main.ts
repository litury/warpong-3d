import { Application } from "pixi.js";
import { ARENA_WIDTH, ARENA_HEIGHT, PADDLE_HEIGHT } from "./config";
import { GameState, GameMode } from "./config/states";
import { Game, InputManager } from "./modules/game";
import { WsClient, processServerMessages } from "./modules/network";
import type { MatchResult } from "./modules/network";
import {
  showScreen, hideAllScreens, updateHudScore, updateHudCoins, updateHudUpgrades,
  setupGameOver, renderShop, updateLobbyStatus,
} from "./modules/ui";
import {
  createDefaultWallet, createDefaultOwned, createDefaultEquipped,
  getLevel, UpgradeId, UpgradeCategory,
} from "./modules/shop/parts/data";
import { computeEffectiveStats, awardCoins, tryBuyUpgrade, getPaddleColor, getTrailType } from "./modules/shop";
import type { PlayerCosmetics, PlayerUpgrades } from "./shared/messages";
import { markDirty, flushSaveIfNeeded, parseLoadOkData } from "./modules/shop/parts/save";
import { YandexSdk } from "./modules/yandex";
import { setLocale, applyDomTranslations, t } from "./i18n";

// --- State ---
let state = GameState.Menu;
let mode = GameMode.Solo;
let game: Game | null = null;
let input: InputManager;
const ws = new WsClient();
const sdk = new YandexSdk();
const matchResult: MatchResult = { playerSide: null, winner: null, opponentCosmetics: null, opponentUpgrades: null };
let lastCoinsEarned = 0;

const wallet = createDefaultWallet();
const owned = createDefaultOwned();
const equipped = createDefaultEquipped();

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

  // Init Yandex SDK
  sdk.init();

  // Wire up UI buttons
  setupButtons();

  // Show menu
  setState(GameState.Menu);

  // Game loop
  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime / 60; // Convert to seconds

    // Poll SDK
    sdk.pollInbox({
      onInitOk: (lang) => {
        setLocale(lang);
        applyDomTranslations();
      },
      onRewardedGranted: () => {
        wallet.coins += 15;
        updateHudCoins(wallet.coins);
        markDirty();
      },
      onLeaderboardEntries: (entries) => {
        if (state === GameState.GameOver) {
          const isOnline = mode === GameMode.Online;
          const playerWon = isOnline
            ? matchResult.winner === matchResult.playerSide
            : (game?.score.left ?? 0) > (game?.score.right ?? 0);
          setupGameOver(playerWon, lastCoinsEarned, wallet.coins, isOnline, entries);
        }
      },
      onLoadOk: (data) => {
        const save = parseLoadOkData(data);
        if (save) {
          wallet.coins = save.wallet.coins;
          Object.assign(owned.levels, save.owned.levels);
          equipped.paddleColor = save.equipped.paddleColor;
          equipped.ballTrail = save.equipped.ballTrail;
          console.log("[save] loaded cloud data, coins:", wallet.coins);
        }
      },
      onPurchaseOk: (productId, token) => {
        const amounts: Record<string, number> = { coins_100: 100, coins_500: 500, coins_1500: 1500 };
        const amount = amounts[productId] ?? 0;
        wallet.coins += amount;
        markDirty();
        window.ysdk_consume_purchase(token);
        console.log("[iap] purchased", productId, "+", amount, "coins");
      },
    });

    // Process network messages (online mode)
    if (ws.connected) {
      processServerMessages(ws, game, matchResult, {
        onQueueJoined: () => updateLobbyStatus(t("lobby.searching")),
        onMatchFound: (side) => {
          matchResult.playerSide = side;
          startGame(GameMode.Online);
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

    // Cloud save debounce
    flushSaveIfNeeded(wallet, owned, equipped);
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
      break;
    case GameState.Playing:
      showScreen("screen-hud");
      updateHudCoins(wallet.coins);
      updateHudUpgrades(owned);
      break;
    case GameState.GameOver:
      showScreen("screen-game-over");
      break;
    case GameState.Lobby:
      showScreen("screen-lobby");
      updateLobbyStatus(t("lobby.connecting"));
      break;
    case GameState.Shop:
      showScreen("screen-shop");
      refreshShop();
      break;
  }
}

function getMyCosmetics(): PlayerCosmetics {
  return {
    paddleColor: getPaddleColor(equipped),
    trailType: getTrailType(equipped),
    ballGlow: getLevel(owned, UpgradeId.BallGlow) > 0,
  };
}

function getMyUpgrades(): PlayerUpgrades {
  return {
    paddleSpeedLevel: getLevel(owned, UpgradeId.PaddleSpeed),
    paddleSizeLevel: getLevel(owned, UpgradeId.PaddleSize),
    ballSpeedLevel: getLevel(owned, UpgradeId.BallStartSpeed),
  };
}

function startGame(gameMode: GameMode) {
  mode = gameMode;
  matchResult.winner = null;

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

  game.onGameOver = (leftWon) => {
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

  lastCoinsEarned = awardCoins(wallet, mode, playerWon);
  markDirty();

  // Submit score to leaderboard
  const maxScore = Math.max(game?.score.left ?? 0, game?.score.right ?? 0);
  sdk.submitScore(maxScore);
  sdk.showFullscreenAd();

  setupGameOver(playerWon, lastCoinsEarned, wallet.coins, isOnline, sdk.leaderboardEntries);
  setState(GameState.GameOver);
}

function refreshShop() {
  renderShop(wallet, owned, equipped,
    (id) => {
      if (tryBuyUpgrade(wallet, owned, id as UpgradeId)) {
        markDirty();
        refreshShop();
      }
    },
    (id) => {
      const upgradeId = id as UpgradeId;
      const def = CATALOG_MAP[upgradeId];
      if (!def) return;
      if (def === "PaddleColor") equipped.paddleColor = upgradeId;
      else if (def === "BallTrail") equipped.ballTrail = upgradeId;
      markDirty();
      refreshShop();
    },
  );
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
    matchResult.playerSide = null;
    matchResult.opponentCosmetics = null;
    matchResult.opponentUpgrades = null;
    startGame(GameMode.Solo);
  });

  document.getElementById("btn-online")?.addEventListener("click", () => {
    setState(GameState.Lobby);
    ws.connect(getMyCosmetics(), getMyUpgrades());
  });

  document.getElementById("btn-shop")?.addEventListener("click", () => {
    setState(GameState.Shop);
  });

  document.getElementById("btn-play-again")?.addEventListener("click", () => {
    if (game) { game.destroy(); game = null; }
    matchResult.playerSide = null;
    matchResult.opponentCosmetics = null;
    matchResult.opponentUpgrades = null;
    startGame(GameMode.Solo);
  });

  document.getElementById("btn-new-opponent")?.addEventListener("click", () => {
    if (game) { game.destroy(); game = null; }
    ws.close();
    setState(GameState.Lobby);
    ws.connect(getMyCosmetics(), getMyUpgrades());
  });

  document.getElementById("btn-watch-ad")?.addEventListener("click", () => {
    sdk.showRewardedVideo();
  });

  document.getElementById("btn-menu-from-gameover")?.addEventListener("click", () => {
    if (game) { game.destroy(); game = null; }
    ws.close();
    setState(GameState.Menu);
  });

  document.getElementById("btn-cancel-lobby")?.addEventListener("click", () => {
    ws.send({ type: "LeaveQueue" });
    ws.close();
    setState(GameState.Menu);
  });

  document.getElementById("btn-shop-back")?.addEventListener("click", () => {
    setState(GameState.Menu);
  });
}

main().catch(console.error);
