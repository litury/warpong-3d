# Pong Yandex

Multiplayer 3D pong game for [Yandex Games](https://yandex.ru/games/). Server-authoritative 1v1 matches with ELO rating, coin economy, upgrades, and cosmetics.

## Tech Stack

- **Server** — Bun, TypeScript, SQLite (WAL mode)
- **Client** — Babylon.js 7, Vite 6, TypeScript
- **Code Quality** — Biome (lint + format)

## Features

- Real-time 1v1 multiplayer over WebSocket
- ELO matchmaking rating (K=32)
- Coin economy with stakes and rewards
- Paddle and ball upgrades
- Cosmetics (paddle colors, ball trails)
- Solo mode with AI opponent
- Yandex Games SDK integration (auth, IAP)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (latest)
- [Node.js](https://nodejs.org/) 18+

### Install & Run

```bash
# Install dependencies
cd server && bun install
cd client-babylon && npm install

# Start server (port 3030)
cd server && bun run dev

# Start client (port 5174)
cd client-babylon && npm run dev
```

Or from the project root:

```bash
npm run dev:server   # server in watch mode
npm run dev:client   # client with HMR
```

## Project Structure

```
pong-yandex/
├── server/            # Bun WebSocket + HTTP server
│   └── src/
│       ├── index.ts           # Entry point
│       ├── catalog.ts         # Shop definitions
│       ├── config/            # Game constants
│       ├── handlers/          # WS message handlers
│       └── modules/           # Auth, DB, game session, matchmaking
│
├── client-babylon/    # Babylon.js 3D client
│   └── src/
│       ├── main.ts            # App init
│       ├── config/            # Game constants
│       ├── game/              # Scene, physics, input, models
│       └── network/           # WebSocket client, state sync
│
└── biome.json         # Linter & formatter config
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `YANDEX_GAMES_SECRET` | — | Yandex Games HMAC secret for auth verification |
| `WS_URL` | `ws://localhost:3030` | WebSocket server URL (client-side, Vite) |

## Scripts (root)

| Command | Description |
|---------|-------------|
| `npm run dev:server` | Start server in watch mode |
| `npm run dev:client` | Start client dev server |
| `npm run typecheck` | TypeScript check (server + client) |
| `npm run lint` | Biome lint |
| `npm run format` | Biome format |
| `npm run check` | Biome lint + format check |
