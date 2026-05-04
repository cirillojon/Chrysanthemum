# 🌸 Chrysanthemum

A relaxing idle garden game where you grow flowers, discover rare species, and compete with friends.

**[Play now →](https://chrysanthemum-pink.vercel.app)**

---

## About

Chrysanthemum is a browser-based idle game built as a personal project. Plant seeds, tend your garden, harvest blooms, and work toward filling your Floral Codex — a living record of every species and mutation you've ever grown.

The game features full cloud save support with Google sign-in, a deep gear and alchemy system, a player-to-player marketplace, global weather events, and over 190 unique flowers across seven rarity tiers.

---

## Features

### Core Gameplay
- **190+ flowers** across Common, Uncommon, Rare, Legendary, Mythic, Exalted, and Prismatic rarities
- **9 mutations** — Golden, Rainbow, Giant, Moonlit, Frozen, Scorched, Wet, Shocked, Windstruck — each affecting a flower's sell value
- **12 flower types** — Blaze, Tide, Grove, Frost, Storm, Lunar, Solar, Fairy, Shadow, Arcane, Stellar, Zephyr
- **Floral Codex** — collect every species and mutation variant; filter by rarity, type, status, or newly discovered
- **Farm upgrades** — expand from a 3×3 starter plot up to a 6×6 Grand Estate
- **Offline progress** — plants keep growing while you're away

### Gear System
- **Sprinklers** — boost growth speed for nearby plots
- **Fans** — spread mutations along a directional line
- **Composters** — passively generate fertilizer over time
- **Balance Scales** — alternately boost and slow adjacent plots
- **Lawnmowers** — auto-harvest bloomed plots
- **Aqueducts** — chain water-based effects across rows
- **Garden Pins** — lock plots from auto-planting
- **Crop Sticks** — crossbreed two plants to produce a hybrid bloom

### Alchemy & Crafting
- **Essence system** — sacrifice flowers to harvest essences by type
- **Alchemy crafting** — combine essences to craft consumables, gear, and seeds
- **Attunement** — fuse essence mutations onto blooms
- **Time-gated crafting queue** — gear and consumables take real time to craft

### Consumables
- **Mutation vials** — apply specific mutations to blooms (Frost, Flame, Moon, Rainbow, Gold, and more)
- **Heirloom Charms** — guarantee a seed return on harvest
- **Eclipse Tonic** — advance every plant and piece of gear on your farm simultaneously
- **Seed Pouches** — plant a whole species type in one action
- **Fertilizers** — speed up growth (Basic 1.1×, Advanced 1.25×, Premium 1.5×, Elite 1.75×, Miracle 2×)

### Economy & Social
- **Shop system** — randomised stock every 10 minutes, scales with farm size
- **Supply shop** — rotating stock of fertilizers, gear, and consumables
- **Marketplace** — list and buy flowers, gear, and consumables from other players
- **Friends list** — send and receive flower gifts
- **Global and friends leaderboard**
- **Profile pages** — view any player's Codex completion and top flowers

### Weather
- **Global weather events** — Rain, Heatwave, Cold Front, Golden Hour, Prismatic Skies, Star Shower, and more
- Weather affects mutation roll rates for all players simultaneously
- Forecast panel shows upcoming weather with countdowns

### Quality of Life
- **Cloud saves** — progress syncs across devices
- **Guest play** — play without an account, upgrade to cloud save anytime
- **Toast notifications** — gain/loss pills for every inventory change
- **Inventory search** — filter seeds, blooms, gear, consumables, and essences by name
- **Error monitoring** — Sentry integration for observability across frontend and edge functions

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS |
| State | React Context + useReducer |
| Backend | Supabase (Postgres + Auth + Edge Functions + Realtime) |
| Auth | Google OAuth via Supabase |
| Deployment | Vercel |
| Monitoring | Sentry |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project
- Google OAuth credentials

### Local setup

```bash
# Clone the repo
git clone https://github.com/brimatt16219/Chrysanthemum.git
cd Chrysanthemum

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Fill in your Supabase URL, anon key, and optional Sentry DSN

# Start dev server
npm run dev
```

### Environment variables

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SENTRY_DSN=https://...@sentry.io/...   # optional — error monitoring
SENTRY_AUTH_TOKEN=...                        # optional — source map uploads on build
```

### Database setup

Run the SQL migrations in `/supabase/migrations/` against your Supabase project, or apply them manually via the SQL Editor in the Supabase dashboard.

---

## Project Structure

```
src/
├── components/       # UI components (Garden, Shop, Inventory, Codex, ...)
├── data/
│   ├── flowers.ts    # All flower species, mutations, and types
│   ├── gear.ts       # Gear definitions and helpers
│   ├── consumables.ts
│   └── upgrades.ts
├── store/
│   ├── gameStore.ts  # Core game logic + state types (pure — no Supabase)
│   ├── GameContext.tsx
│   └── cloudSave.ts  # Supabase read/write
├── hooks/
│   ├── useWeather.ts
│   ├── useGrowthTick.ts
│   └── ...
└── lib/
    ├── supabase.ts
    └── edgeFunctions.ts  # Typed wrappers for all edge function calls

supabase/
├── functions/        # 34 Deno edge functions
│   ├── _shared/      # Shared utilities (CORS, Sentry, alchemy data)
│   ├── harvest/
│   ├── harvest-all/
│   ├── plant-seed/
│   └── ...
└── migrations/
```

---

## Flower Rarities

| Rarity | Count | Example |
|---|---|---|
| Common | 38 | Daisy, Dandelion, Clover |
| Uncommon | 38 | Rose, Snapdragon, Tulip |
| Rare | 34 | Orchid, Passionflower, Wisteria |
| Legendary | 32 | Lotus, Oracle Eye, Starloom |
| Mythic | 27 | Chrysanthemum, Solar Rose, Void Chrysalis |
| Exalted | 12 | Graveweb, Nightwing, Dreambloom |
| Prismatic | 10 | Princess Blossom, Eternal Heart, Nova Bloom |

---

## Mutations

| Mutation | Emoji | Multiplier | Notes |
|---|---|---|---|
| Golden | ✨ | 4.0× | Rare, high value |
| Rainbow | 🌈 | 5.0× | Highest value mutation |
| Moonlit | 🌙 | 2.5× | Weather-influenced |
| Shocked | ⚡ | 2.5× | Upgrades from Wet via lightning |
| Giant | ⬆️ | 2.0× | |
| Frozen | ❄️ | 2.0× | Cold Front weather |
| Scorched | 🔥 | 2.0× | Heatwave weather |
| Wet | 💧 | 1.1× | Rain weather |
| Windstruck | 🌪️ | 0.7× | Reduces value — remove with Purity Vial |

---

## CI

```bash
npm run typecheck   # tsc
npm run lint        # eslint
npm run test:ci     # vitest
npm run build       # vite build + source map upload
```

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for a full version history.

---

## License

MIT — feel free to fork and build your own garden game.
