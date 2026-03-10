# Pong Yandex

Multiplayer 3D pong game for Yandex Games. Server-authoritative 1v1 matches with ELO rating, coin economy, upgrades, and cosmetics. Babylon.js client, Bun WebSocket server, SQLite persistence.

## Architecture

```
pong-yandex/
├── server/           # Bun WebSocket + HTTP server (TypeScript)
│   └── src/
│       ├── index.ts              # Entry point: WS lifecycle, message dispatch
│       ├── catalog.ts            # Upgrade/cosmetic shop definitions
│       ├── config/gameConfig.ts  # Physics constants (arena, paddle, ball)
│       ├── handlers/             # WS message handlers (auth, purchase, cosmetic, validate)
│       ├── modules/
│       │   ├── auth/             # Yandex HMAC-SHA256 signature verification
│       │   ├── db/               # SQLite player persistence (bun:sqlite)
│       │   ├── gameSession/      # Live match: tick loop, scoring, ELO settlement
│       │   │   └── parts/        # Physics subsystems (collision, simulation)
│       │   └── matchmaking/      # FIFO queue, session lifecycle
│       ├── routes/http.ts        # REST endpoints + WS upgrade
│       └── shared/messages.ts    # Network protocol types
│
├── client-babylon/   # Babylon.js 3D client (TypeScript + Vite)
│   └── src/
│       ├── main.ts               # App init, subsystem wiring
│       ├── AppState.ts           # Game mode, player side, animation state
│       ├── RenderLoop.ts         # Frame loop, 3D position sync, mech animation
│       ├── UIManager.ts          # DOM HUD (score, menu, game-over)
│       ├── config/gameConfig.ts  # Physics constants (DUPLICATED from server)
│       ├── game/
│       │   ├── GameLogic.ts      # Client-side physics (solo mode + server reconciliation)
│       │   ├── GameScene.ts      # Babylon scene setup (camera, lights, arena, scoreboard)
│       │   ├── InputManager.ts   # Keyboard + touch input → direction
│       │   ├── MechLoader.ts     # GLB mech model loader (cached singleton)
│       │   ├── ZombieLoader.ts   # GLB zombie model loader + instancing
│       │   └── ZombieManager.ts  # Zombie AI, spawning, pooling, combat
│       ├── network/
│       │   ├── wsClient.ts       # WebSocket client, inbox queue, auth
│       │   └── sync.ts           # Server message → game state application
│       ├── shared/messages.ts    # Network protocol types (DUPLICATED from server)
│       └── types.ts              # BallData, Score interfaces
│
└── .gitignore
```

## Shared Code Duplication

There is no shared package. These files are **manually kept in sync**:

| File | Server path | Client path |
|------|-------------|-------------|
| Network messages | `server/src/shared/messages.ts` | `client-babylon/src/shared/messages.ts` |
| Game config | `server/src/config/gameConfig.ts` | `client-babylon/src/config/gameConfig.ts` |

**When editing these, update both copies.** The server version is authoritative.

## Dev Commands

```bash
# Server (Bun, port 3030)
cd server && bun run dev          # watch mode
cd server && bun run start        # production

# Client (Vite, port 5174)
cd client-babylon && npm run dev  # dev server with HMR
cd client-babylon && npm run build  # tsc + vite build
```

No monorepo tooling — each directory has its own `package.json`.

## Game Constants (config/gameConfig.ts)

```
Arena:    800×600
Paddle:   15×100, 30px margin, 400 px/s
Ball:     15px diameter, 300 initial speed, +20/hit, 600 max
Win:      first to 5
Tick:     60/s (16.67ms)
```

Upgrade scaling: `+50 speed/level`, `+15 paddle height/level`, `+30 ball speed/level`.

## Network Protocol (shared/messages.ts)

JSON over WebSocket. All messages have a `type` discriminant field.

### Client → Server
| Type | Key fields |
|------|-----------|
| `Auth` | `signature`, `uniqueId`, `name` |
| `JoinQueue` | — |
| `LeaveQueue` | — |
| `PlayerInput` | `direction`: `"Up"` / `"Down"` / `"Idle"` |
| `QuickChat` | `chatId`: `"gg"` / `"nice"` / `"wow"` / `"glhf"` / `"oops"` / `"rematch"` |
| `BuyUpgrade` | `upgradeId` |
| `EquipCosmetic` | `slot`: `"paddleColor"` / `"ballTrail"`, `itemId` |
| `RewardCoins` | `amount` |
| `PurchaseCoins` | `productId` |

### Server → Client
| Type | Key fields |
|------|-----------|
| `PlayerSync` | `coins`, `mmr`, `upgrades`, `paddleColor`, `ballTrail`, `winStreak` |
| `QueueJoined` | — |
| `MatchFound` | `side`, `opponentCosmetics`, `opponentUpgrades`, `stake`, `mmr`, `opponentMmr` |
| `GameStateUpdate` | `ball`, `leftPaddle`, `rightPaddle`, `score` |
| `GameEvent` | `event`: `BallHitPaddle` / `BallHitWall` / `PlayerScored` |
| `GameOver` | `winner`, `reward`, `mmr`, `mmrChange`, `coins` |
| `OpponentDisconnected` | `reward`, `coins` |
| `OnlineCount` | `count` |
| `OpponentChat` | `chatId` |
| `Error` | `message` |

Auth must be the first message after connection. Server ignores all other messages until authenticated.

## Code Conventions

- **Language**: TypeScript, strict mode
- **Naming**: camelCase for variables/functions, PascalCase for types/classes/interfaces
- **Modules**: barrel exports via `index.ts` (re-export from implementation file)
- **Parts pattern**: complex modules split into `parts/` subdirectory (e.g. `gameSession/parts/collision.ts`, `simulation.ts`)
- **DB columns**: snake_case in SQLite, camelCase in TypeScript (converted by `rowToRecord()`)
- **Upgrade IDs**: snake_case strings in catalog (`paddle_speed`, `ball_start_speed`)
- **Player sides**: `"Left"` | `"Right"` (PascalCase string union)
- **Message types**: PascalCase verb+noun (`MatchFound`, `GameOver`, `PlayerSync`)
- **No shared package**: duplicated files kept manually in sync

## Commit Format

Conventional commits with scope:

```
type(scope): description

type:  feat, fix, refactor, clean, add
scope: server, client, auth, babylon
```

Examples from history:
```
feat(server): add websocket message validation
fix(client): send auth message on websocket connect
refactor(babylon): split main.ts into AppState, UIManager and RenderLoop
clean(client): remove pixi.js client
```

## Key Mechanics

- **ELO**: K=32, standard formula, floor at 0
- **Stake**: 10 coins per match, 10% house commission → winner gets 18, loser loses 10
- **Collision**: AABB, bounce angle ±45° based on paddle hit offset
- **Rewards**: 30s cooldown, max 15 coins per claim (anti-fraud)
- **IAP products**: `coins_100`, `coins_500`, `coins_1500`
- **Default player**: 100 coins, 1000 MMR

## Database (SQLite, WAL mode)

Table `players`: `id`, `name`, `coins`, `mmr`, `upgrades_json`, `paddle_color`, `ball_trail`, `total_online_wins`, `win_streak`, `created_at`.

All queries use prepared statements. `settleGame()` uses a transaction for atomic win/loss settlement.

## Common Pitfalls

1. **Shared code duplication** — editing `messages.ts` or `gameConfig.ts` in only one place will cause client/server desync. Always update both.
2. **Coordinate system mismatch** — game logic uses 2D (x, y), Babylon.js uses (x, z) for ground plane. Y↔Z flip happens in `RenderLoop.ts:syncPositions()`.
3. **Auth required first** — server drops all messages until `Auth` is received. The client sends auth on WebSocket `open` event (`wsClient.ts:connectPassive()`).
4. **Server-authoritative** — CATALOG, IAP product list, and game physics are server-authoritative. Client physics only run in solo mode; online mode applies server state via `GameLogic.applyServerState()`.
5. **Asset caching** — `MechLoader` and `ZombieLoader` use singleton asset containers. Call `resetTemplate()` on ZombieLoader if reloading scenes.
6. **Zombie object pooling** — `ZombieManager` pools up to `MAX_POOL=15` instances. Disposed zombies beyond pool size are fully released.
7. **No test suite** — there are currently no automated tests.
