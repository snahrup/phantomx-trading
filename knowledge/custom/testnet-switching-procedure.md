---
id: kb-testnet-switching
title: Phemex Testnet/Mainnet Switching Procedure
category: custom
tags: ["testnet", "phemex", "configuration", "paper-trading"]
source: founding-engineer
created: 2026-03-07T23:55:00.000Z
updated: 2026-03-07T23:55:00.000Z
---

# Phemex Testnet/Mainnet Switching Procedure

## Overview

PhantomX supports runtime switching between Phemex mainnet and testnet sandbox. This enables safe paper trading without touching real funds.

## Prerequisites

1. **Testnet account**: Register at https://testnet.phemex.com/
2. **Testnet API keys**: Generate at https://testnet.phemex.com/ under API settings
3. **Testnet funds**: The testnet sandbox provides virtual USDT for paper trading

## Configuration

### Option A: Environment Variables (Recommended)

Add testnet keys to your `.env.local`:

```env
# Mainnet keys (existing)
PHEMEX_API_KEY=your_mainnet_key
PHEMEX_API_SECRET=your_mainnet_secret

# Testnet keys (add these)
PHEMEX_TESTNET_API_KEY=your_testnet_key
PHEMEX_TESTNET_API_SECRET=your_testnet_secret

# To default to testnet on startup:
PHEMEX_TESTNET=true
```

### Option B: Separate Env File

Use `.env.local.testnet` as a template — copy it to `.env.local` to run in testnet-only mode.

## Runtime Switching via API

### Check current network

```bash
curl -X POST http://localhost:3100/api/phemex \
  -H "Content-Type: application/json" \
  -d '{"action": "network"}'
```

Response: `{"configured":"mainnet","hasTestnetKeys":false,"hasMainnetKeys":true}`

### Switch to testnet

```bash
curl -X POST http://localhost:3100/api/phemex \
  -H "Content-Type: application/json" \
  -d '{"action": "switch_network", "network": "testnet"}'
```

### Switch to mainnet

```bash
curl -X POST http://localhost:3100/api/phemex \
  -H "Content-Type: application/json" \
  -d '{"action": "switch_network", "network": "mainnet"}'
```

### Connect and verify

```bash
curl -X POST http://localhost:3100/api/phemex \
  -H "Content-Type: application/json" \
  -d '{"action": "connect_and_verify", "useEnv": true, "testnet": true}'
```

## Key Behavior

- **Credential resolution**: When `PHEMEX_TESTNET=true`, the client prefers `PHEMEX_TESTNET_API_KEY/SECRET`. Falls back to `PHEMEX_API_KEY/SECRET` if testnet-specific vars aren't set.
- **Client singleton**: `switch_network` resets and reinitializes the CCXT client. Active connections are dropped.
- **Time sync**: The client auto-syncs with the correct server (`testnet-api.phemex.com` or `api.phemex.com`) based on the current mode.
- **Kill switch**: Operates independently of network — kill switch state persists across network switches.
- **Available symbols**: Testnet has a limited symbol set compared to mainnet. Not all mainnet pairs exist on testnet.

## Safety Rules

1. **NEVER commit `.env.local` to git** — it contains real credentials
2. **Mainnet keys do NOT work on testnet** (and vice versa)
3. **Always verify the network** before placing orders: check `network` action response
4. **Kill switch is network-agnostic** — if triggered on mainnet, it blocks orders on testnet too
5. **Restart is not required** — runtime switching reinitializes the client in-place

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No API credentials available for testnet" | Set `PHEMEX_TESTNET_API_KEY` and `PHEMEX_TESTNET_API_SECRET` in `.env.local` |
| "Invalid API credentials" after switch | Mainnet keys don't work on testnet — generate separate testnet keys |
| "Cannot reach Phemex" on testnet | Testnet may be down — check https://testnet.phemex.com/ |
| Clock sync errors | Server auto-syncs, but large drift (>30s) may need system clock fix |
