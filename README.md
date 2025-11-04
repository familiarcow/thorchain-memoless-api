# THORChain Memoless API

A simple API that lets anyone use THORChain without needing RUNE tokens for fees. Just send your transaction with a reference ID embedded in the amount, and this API handles the rest. Any interface can run this in the backend to have their own dedicated "Memoless" service for THORChain, meaning you can swap without connecting a wallet! Just reigster and send a specific amount to the network using this API as a tool.

## What it does

This API should be run by interfaces looking to provide their users with Memoless Swaps.

1. Call our API to register the user's intended transaction memo (like a swap)
2. Get back a reference ID (e.g. "42075")  
3. Send their transaction with the reference ID in the decimal places (e.g. send `1.50042075` BTC instead of `1.5` BTC)
4. THORChain automatically executes their original intent

This API manages a hot RUNE wallet and manages the registration of the memo, along with preflight checks before sending.

## Key Features

- Built in database for tracking purposes. Can be disabled.
- Swap memo detection & affiliate injection to detect when the memo is a swap and cleanly adds your affiliate & fee into the swap details
- Discord / Slack webhooks for notifications every time a memo is registered, or fails
- Helper API to adjust a desired amount to a Memoless amount
- Preflight API to double check you're sending the right about before sending
- Automated deposit QR code generation

## Quick Start

### 1. Setup

```bash
# Clone and install
git clone <your-repo>
cd thorchain-memoless-api
npm install

# Create environment file
cp .env.example .env
```

### 2. Configure `.env`

```bash
# ===========================================
# REQUIRED ENVIRONMENT VARIABLES
# ===========================================

# Hot Wallet Configuration (REQUIRED)
HOT_WALLET_MNEMONIC="your twelve word mnemonic here"

# Database Configuration (OPTIONAL - will run without persistent storage if not provided)
# For development, you can use PostgreSQL or SQLite
# PostgreSQL example:
# DATABASE_URL="postgresql://username:password@localhost:5432/thorchain_memoless"
# SQLite example (easier for development):
DATABASE_URL="sqlite:./dev-database.db"

# ===========================================
# NETWORK CONFIGURATION
# ===========================================

# THORChain Network (mainnet or stagenet)
THORCHAIN_NETWORK=stagenet

# API Server Configuration
NODE_ENV=development
PORT=8080

# ===========================================
# OPTIONAL CONFIGURATION
# ===========================================

# CORS Configuration
CORS_ORIGINS=http://localhost:8080,http://localhost:3000,http://localhost:3001

# Rate Limiting
RATE_LIMIT=100

# Logging
LOG_LEVEL=info

# ===========================================
# NOTIFICATION WEBHOOKS
# ===========================================

# Enable/disable webhook notifications
ENABLE_DISCORD_WEBHOOK=false
ENABLE_SLACK_WEBHOOK=false

# Discord webhook URL for notifications
# DISCORD_WEBHOOK=https://discord.com/api/webhooks/YOUR/WEBHOOK/URL

# Slack webhook URL for notifications (optional)
# SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK

# Low Balance Alert Configuration
# Minimum registrations remaining before sending low balance alert
LOW_BALANCE_ALERT_THRESHOLD=25

# ===========================================
# AFFILIATE CONFIGURATION
# ===========================================

# Enable/disable automatic affiliate injection in swap and liquidity memos
INJECT_AFFILIATE_IN_SWAPS=true

# THORName or address for affiliate fees
# Examples: "wd", "dx", "t", "thor1234...", etc. Leave empty to disable affiliate fees
AFFILIATE_THORNAME=

# Affiliate fee in basis points (1 basis point = 0.01%, max 10000 = 100%)
# Example: 5 = 0.05%, 50 = 0.5%, 500 = 5%
AFFILIATE_FEE_BP=5
```

### 3. Run

```bash
# Development
npm run dev

# Production
npm run build
npm start

# View API docs at http://localhost:8080
```

## Key Endpoints

- `GET /health` - Check API status and wallet balance
- `GET /api/v1/assets` - List supported assets  
- `POST /api/v1/register` - Register a transaction, get reference ID
- `POST /api/v1/suggest-amounts` - Calculate amount with embedded reference ID

## Example Usage

```bash
# 1. Register a swap from BTC to RUNE
curl -X POST http://localhost:8080/api/v1/register \
  -H "Content-Type: application/json" \
  -d '{"asset": "BTC.BTC", "memo": "=:THOR.RUNE"}'

# Response: {"registrationId": "abc123", "referenceId": "42075", ...}

# 2. Get the exact amount to send
curl -X POST http://localhost:8080/api/v1/suggest-amounts \
  -H "Content-Type: application/json" \
  -d '{"asset": "BTC.BTC", "referenceId": "42075", "desiredAmounts": ["0.001"]}'

# Response: {"suggestedAmounts": ["0.00142075"]}

# 3. Send 0.00142075 BTC to the THORChain BTC address
# THORChain will execute your swap automatically
```

## Architecture

The API acts as a proxy between users and THORChain:

1. **Registration**: We submit your memo to THORChain and get a reference ID
2. **Amount encoding**: Reference ID gets embedded in your transaction amount  
3. **User transaction**: You send to THORChain with the encoded amount
4. **Execution**: THORChain extracts the reference encoded in the amount and executes your memo

## Documentation

- [Configuration Guide](./docs/CONFIGURATION.md) - Environment variables and setup
- [API Reference](./docs/API_REFERENCE.md) - Complete endpoint documentation
- [Integration Guide](./docs/INTEGRATION_GUIDE.md) - Step-by-step integration for frontends
- [Overview](./docs/OVERVIEW.md) - Complete documentation structure

## Requirements

- Node.js 18+
- A THORChain wallet with RUNE for fees
- Optional: PostgreSQL for production

## Security Notes

- Use a dedicated hot wallet with minimal RUNE (~10-100 RUNE). Each registration costs 0.02 RUNE, so 100 RUNE is good for 5,000 registrations
- Use discord or slack webhooks to stay alerted to your wallet balance
- Never commit your `.env` file
- Test on stagenet before mainnet
- Monitor wallet balance via webhooks

## Notes
- Registration takes 5-7 seconds, since it is reliant on THORChain block times
- There's no gating to registering swaps. This service can be API gated, or another alternative to prevent spam
- Use the affiliate injection to set up a small fee for swaps. You can use this to continuously top up the hot wallet to create a sustainable stream of RUNE funding the registration costs.