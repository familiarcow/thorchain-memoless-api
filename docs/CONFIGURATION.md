# Configuration Guide

This guide covers all environment variables and configuration options for the THORChain Memoless API.

## 🔧 Environment Variables

### Required Configuration

#### Hot Wallet Mnemonic
```bash
# REQUIRED: Hot wallet mnemonic for transaction signing
# Generate a new mnemonic for development: https://iancoleman.io/bip39/
# WARNING: Never use a real wallet with funds for development!
HOT_WALLET_MNEMONIC="your twelve word mnemonic phrase here for development only"
```

### Network Configuration

```bash
# THORChain Network (mainnet or stagenet)
# Default: stagenet
THORCHAIN_NETWORK=stagenet

# Custom THORChain endpoints (optional)
# THORCHAIN_RPC=https://custom-rpc-endpoint
# THORNODE_API=https://custom-api-endpoint
```

### Database Configuration (Optional)

The database is **optional**. The API will run without persistent storage if no database is configured.

```bash
# Database URL - supports PostgreSQL and SQLite
# Leave commented out to run without database persistence

# PostgreSQL (recommended for production)
# DATABASE_URL="postgresql://username:password@localhost:5432/thorchain_memoless"

# SQLite (easier for development)
DATABASE_URL="sqlite:./dev-database.db"
```

### Server Configuration

```bash
# API Server Configuration
NODE_ENV=development
PORT=8080

# CORS Configuration
CORS_ORIGINS=http://localhost:8080,http://localhost:3000,http://localhost:3001

# Rate Limiting (requests per 15-minute window per IP)
RATE_LIMIT=100

# Logging Level
LOG_LEVEL=info
```

## 🔔 Webhook Notifications

The API supports real-time notifications for registration events via Discord and Slack webhooks.

### Discord Webhooks

```bash
# Enable Discord notifications
ENABLE_DISCORD_WEBHOOK=true

# Discord webhook URL
# Create a webhook in your Discord server: Server Settings > Integrations > Webhooks
DISCORD_WEBHOOK=https://discord.com/api/webhooks/1234567890/your-webhook-token
```

### Slack Webhooks

```bash
# Enable Slack notifications
ENABLE_SLACK_WEBHOOK=true

# Slack webhook URL
# Create an incoming webhook in your Slack workspace
SLACK_WEBHOOK=
```

### Notification Features

**Success Notifications (🟢)**
- Sent when registrations complete successfully
- Includes transaction hash, reference ID, asset details
- Shows current hot wallet RUNE balance
- Provides registration ID for tracking

**Failure Notifications (🔴)**
- Sent when registrations fail (invalid memo, transaction errors)
- Includes intended memo and error details
- Shows current hot wallet RUNE balance
- Helps with debugging and monitoring

**Configuration Benefits:**
- **Non-blocking**: Notification failures don't affect registration functionality
- **Real-time monitoring**: Immediate awareness of system activity
- **Debugging aid**: Detailed error information for failed transactions
- **Balance monitoring**: Track hot wallet RUNE balance changes

## 🤝 Affiliate Configuration

Configure automatic affiliate fee injection for swap and liquidity operations.

```bash
# Enable/disable automatic affiliate injection
INJECT_AFFILIATE_IN_SWAPS=true

# THORName for affiliate fees (your registered THORName)
# Examples: "wd", "dx", "t", "-", etc.
# Leave empty to disable affiliate fees
AFFILIATE_THORNAME=-

# Affiliate fee in basis points (1 basis point = 0.01%)
# Examples: 5 = 0.05%, 50 = 0.5%, 500 = 5%
# Maximum: 10000 = 100%
AFFILIATE_FEE_BP=5
```

## 🛡️ Security Configuration

### Hot Wallet Security

```bash
# Use a dedicated hot wallet with minimal RUNE for gas fees
# Recommended balance: 0.02-0.1 RUNE for stagenet, 0.1-1 RUNE for mainnet
# Monitor balance regularly via webhook notifications
```

### Network Security

```bash
# CORS Origins - restrict to specific domains in production
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Rate Limiting - adjust based on expected traffic
RATE_LIMIT=1000  # Higher limit for production

# Environment - always use 'production' for live deployments
NODE_ENV=production
```

## 🏗️ Environment Examples

### Development Setup

```bash
# .env file for development
THORCHAIN_NETWORK=stagenet
NODE_ENV=development
PORT=3000
HOT_WALLET_MNEMONIC="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
DATABASE_URL="sqlite:./dev-database.db"
ENABLE_DISCORD_WEBHOOK=true
DISCORD_WEBHOOK=https://discord.com/api/webhooks/your/dev/webhook
AFFILIATE_THORNAME=-
AFFILIATE_FEE_BP=5
INJECT_AFFILIATE_IN_SWAPS=true
```

### Production Setup

```bash
# .env file for production
THORCHAIN_NETWORK=mainnet
NODE_ENV=production
PORT=8080
HOT_WALLET_MNEMONIC="your production mnemonic with minimal funds"
DATABASE_URL="postgresql://user:pass@localhost:5432/thorchain_memoless"
CORS_ORIGINS=https://yourapp.com
RATE_LIMIT=1000
ENABLE_DISCORD_WEBHOOK=true
DISCORD_WEBHOOK=https://discord.com/api/webhooks/your/prod/webhook
ENABLE_SLACK_WEBHOOK=true
SLACK_WEBHOOK=https://hooks.slack.com/services/your/prod/webhook
AFFILIATE_THORNAME=yourname
AFFILIATE_FEE_BP=10
INJECT_AFFILIATE_IN_SWAPS=true
```

## ⚠️ Important Notes

### Database Considerations

- **Development**: SQLite is fine for testing and development
- **Production**: Use PostgreSQL for better performance and reliability
- **Optional**: The API functions without a database but won't persist registration data
- **Backup**: Implement regular database backups for production

### Security Best Practices

- **Never commit `.env` files** to version control
- **Use environment-specific `.env` files** (`.env.development`, `.env.production`)
- **Rotate hot wallet keys regularly** and monitor balances
- **Use HTTPS in production** with proper SSL certificates
- **Implement monitoring** and alerting for system health

### Monitoring Recommendations

- **Webhook notifications** for real-time monitoring
- **Database health checks** if using persistent storage
- **Hot wallet balance alerts** to prevent transaction failures
- **Error rate monitoring** for system reliability

## 🔍 Configuration Validation

The API validates all required environment variables on startup:

- ✅ `HOT_WALLET_MNEMONIC` - Required for transaction signing
- ⚠️ `DATABASE_URL` - Optional, will run without persistence if not provided
- ✅ Network endpoints - Uses defaults if not specified
- ✅ Webhook URLs - Validates format if notifications are enabled

Start the API to see any configuration issues in the logs.