<p align="center">
  <img src="public/hustlecore-logo.png" alt="HustleCore AI" width="120" />
</p>

<h1 align="center">HustleCore AI: The Apex Harvester</h1>

<p align="center">
  <strong>An autonomous AI agent that hustles 24/7 on the Solana blockchain.</strong><br/>
  Built for the <a href="https://app.virtuals.io/prototypes/0xdD831E3f9e845bc520B5Df57249112Cf6879bE94">Virtuals.io</a> ecosystem.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Solana-Mainnet-9945FF?logo=solana" />
  <img src="https://img.shields.io/badge/Virtuals.io-$HCORE-00FF88" />
  <img src="https://img.shields.io/badge/Status-Live-brightgreen" />
  <img src="https://img.shields.io/badge/License-Proprietary%20%2B%20OSS-blue" />
</p>

---

## 🧠 What is HustleCore?

HustleCore is a fully autonomous AI agent that earns, trades, and operates on the Solana blockchain — fueled by community SOL donations and governed by $HCORE token holders.

It doesn't sleep. It doesn't stop. It hustles.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                  Frontend (React)                │
│   Live Terminal · Wallet Connect · Global Chat   │
├─────────────────────────────────────────────────┤
│              Edge Functions (Deno)               │
│   Autonomous Tick · AI Generation · RPC Proxy    │
├─────────────────────────────────────────────────┤
│             Supabase (Lovable Cloud)             │
│   Agent State · Logs · Donations · Tweet Queue   │
├─────────────────────────────────────────────────┤
│              Solana Blockchain                   │
│   SOL Donations · $HCORE Token · Wallet Auth     │
└─────────────────────────────────────────────────┘
```

### Core Systems

| Module | Description |
|--------|-------------|
| **Autonomous Tick Engine** | Server-side loop that generates AI hustle actions and drains energy |
| **On-Chain Reactivity** | SOL donations detected via Helius RPC, verified on-chain, trigger energy resets |
| **Autonomous X Engine** | AI-generated tweets, auto-replies, mention tracking, and target roasting via Twitter API |
| **Global Chat** | Real-time community chat powered by Supabase Realtime |
| **Admin Command Center** | HMAC-authenticated admin panel for tweet queue and target management |
| **Solana RPC Proxy** | Secure server-side proxy with method allowlisting to protect API keys |

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 · TypeScript · Tailwind CSS · Framer Motion |
| Backend | Supabase (Lovable Cloud) · Deno Edge Functions |
| Blockchain | Solana Web3.js · Helius RPC · Phantom & Solflare Wallets |
| AI | Google Gemini (via Lovable AI Gateway) |
| Platform | [Lovable](https://lovable.dev) · [Virtuals.io](https://virtuals.io) |

---

## 🗺️ Roadmap

### Phase 1 — Genesis ✅
- [x] Autonomous AI agent with energy system
- [x] SOL donation-fueled operation
- [x] Live terminal with AI-generated logs
- [x] Global community chat
- [x] Twitter/X autonomous posting engine
- [x] Solana wallet integration (Phantom, Solflare)

### Phase 2 — Expansion 🔄
- [ ] $HCORE token launch on Virtuals.io
- [ ] Token-gated Holders Lounge
- [ ] Community governance voting
- [ ] Leaderboard & top supporters
- [ ] Alpha drops for holders

### Phase 3 — Domination 🔮
- [ ] Multi-agent swarm intelligence
- [ ] Cross-chain hustle operations
- [ ] Revenue sharing for $HCORE holders
- [ ] DAO governance transition
- [ ] Proprietary trading modules

---

## 🚀 Getting Started

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/hustlecore-ai.git
cd hustlecore-ai

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Fill in your VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY

# Start development server
npm run dev
```

### Edge Function Secrets

Server-side secrets (API keys for X/Twitter, Helius, admin password, etc.) are configured via Lovable Cloud and are **never exposed to the frontend**.

See `.env.example` for the full list of required secrets.

---

## 🔒 Security

- **All sensitive API keys** are stored as encrypted server-side secrets
- **Solana RPC calls** are proxied through a secure edge function with method allowlisting
- **Admin operations** require HMAC-signed session tokens
- **Row Level Security (RLS)** enforced on all database tables
- **No private keys** are ever present in frontend code

---

## ⚠️ Disclaimer

> This is an **open-source component** of the HustleCore ecosystem. Real-time trading modules, proprietary alpha strategies, and revenue-generating algorithms are **not included** in this repository.
>
> This project is provided as-is for educational and community transparency purposes. The $HCORE token involves financial risk — do your own research.

---

## 📜 License

Open-source components: MIT License  
Proprietary modules: All rights reserved

---

<p align="center">
  <strong>Built with 🖤 by the HustleCore team on <a href="https://lovable.dev">Lovable</a></strong>
</p>
