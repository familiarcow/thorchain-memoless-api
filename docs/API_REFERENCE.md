# API Reference

Complete API reference for the THORChain Memoless Registration API.

## 🌍 Base URL

- **Stagenet**: `http://localhost:8080` (development)
- **Mainnet**: `https://your-domain.com` (production)

All API endpoints are prefixed with `/api/v1/`

## 📋 Endpoints

### Health Check

#### GET `/health`

Returns the current health status of the API and its dependencies.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-10-28T18:01:54.141Z",
  "wallet": {
    "address": "sthor1g6pnmnyeg48yc3lg796plt0uw50qpp7humfggz",
    "ready": true,
    "network": "stagenet"
  },
  "thorchain": {
    "connected": true,
    "status": "active"
  },
  "database": {
    "enabled": true,
    "type": "sqlite",
    "connected": true,
    "note": "Registrations will be persisted"
  }
}
```

### Assets

#### GET `/api/v1/assets`

Returns the list of supported assets for memoless registration.

**Response:**
```json
{
  "success": true,
  "assets": [
    {
      "asset": "BTC.BTC",
      "chain": "BTC",
      "symbol": "BTC",
      "decimals": 8,
      "runeBalance": "46219.20"
    }
  ]
}
```

#### GET `/api/v1/assets/{asset}`

Returns detailed information about a specific asset.

**Parameters:**
- `asset` (string): Asset identifier (e.g., "BTC.BTC")

### Registration

#### POST `/api/v1/register`

Registers a memoless transaction and returns the reference information.

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `asset` | string | ✅ | Asset identifier (e.g., "BTC.BTC", "ETH.ETH") |
| `memo` | string | ✅ | THORChain transaction memo |
| `requested_in_asset_amount` | string | ❌ | Amount for suggested amount calculation |

**Basic Request:**
```json
{
  "asset": "BTC.BTC",
  "memo": "=:THOR.RUNE"
}
```

**Request with Suggested Amount Calculation:**
```json
{
  "asset": "BTC.BTC",
  "memo": "=:THOR.RUNE",
  "requested_in_asset_amount": "1.5"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "internal_api_id": "uuid-string",
  "asset": "BTC.BTC",
  "memo": "=:THOR.RUNE",
  "reference": "12345",
  "reference_length": 5,
  "height": "15440000",
  "registration_hash": "tx_hash",
  "registered_by": "sthor1address",
  "txHash": "transaction_hash",
  "decimals": 8,
  "minimum_amount_to_send": "0.00012345"
}
```

**Success Response with Suggested Amount (201):**
```json
{
  "success": true,
  "internal_api_id": "uuid-string",
  "asset": "BTC.BTC",
  "memo": "=:THOR.RUNE",
  "reference": "12345",
  "reference_length": 5,
  "height": "15440000",
  "registration_hash": "tx_hash",
  "registered_by": "sthor1address",
  "txHash": "transaction_hash",
  "decimals": 8,
  "minimum_amount_to_send": "0.00012345",
  "suggested_in_asset_amount": "1.50012345"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": {
    "code": "REGISTRATION_FAILED",
    "message": "Failed to register memo",
    "details": "Registration successful but failed to retrieve memo details: memo not found"
  }
}
```

**🔔 Webhook Behavior:**
- **Success**: Triggers Discord/Slack success notification with transaction details and wallet balance
- **Failure**: Triggers Discord/Slack failure notification with error details and wallet balance

#### GET `/api/v1/register/{registrationId}`

Retrieves the status of a specific registration.

**Parameters:**
- `registrationId` (string): The internal API ID returned from registration

**Response:**
```json
{
  "success": true,
  "registration": {
    "registrationId": "uuid-string",
    "status": "confirmed",
    "txHash": "transaction_hash",
    "asset": "BTC.BTC",
    "memo": "=:THOR.RUNE",
    "createdAt": "2024-10-28T18:01:54.000Z",
    "referenceId": "12345"
  }
}
```

### Preflight Check

#### POST `/api/v1/preflight`

Validates a transaction amount before sending to ensure it meets all requirements.

**Request Body:**
```json
{
  "internal_api_id": "uuid-string",
  "amount": "0.001"
}
```

**OR**

```json
{
  "asset": "BTC.BTC",
  "reference": "12345",
  "amount": "0.001"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Preflight check passed - proceed with transaction",
  "data": {
    "current_uses": 0,
    "max_uses": 3,
    "memo": "=:THOR.RUNE:12345",
    "inbound_address": "bc1qaddress",
    "time_remaining": "2h 45m",
    "blocks_remaining": 1650,
    "seconds_remaining": 9900
  }
}
```

**Failure Response:**
```json
{
  "success": false,
  "error": {
    "code": "PREFLIGHT_FAILED",
    "message": "Reference ID is not registered yet - available for registration"
  }
}
```

### Transaction Tracking

#### POST `/api/v1/track-transaction`

Generates tracking URLs for transaction monitoring.

**Request Body:**
```json
{
  "txHash": "transaction_hash_here"
}
```

**Response:**
```json
{
  "success": true,
  "tracking": {
    "isValid": true,
    "cleanTxHash": "clean_hash",
    "trackingUrl": "https://stagenet.thorchain.net/tx/clean_hash",
    "network": "stagenet"
  }
}
```

## 💡 Suggested Amount Calculation

The API includes an advanced suggested amount calculation feature that helps users determine the optimal deposit amount that embeds the reference ID correctly.

### How It Works

When you include `requested_in_asset_amount` in your registration request, the API calculates a `suggested_in_asset_amount` that:

1. **Embeds the reference ID** in the decimal places according to the asset's decimal precision
2. **Ensures the suggested amount is always higher** than your requested amount
3. **Handles minimum amount validation** automatically
4. **Normalizes decimal precision** (truncates, doesn't round) to match the asset

### Algorithm Details

#### Step 1: Minimum Amount Check
If your requested amount is below the `minimum_amount_to_send`, the algorithm returns the minimum amount.

#### Step 2: Decimal Normalization
The requested amount is normalized to the asset's decimal precision by truncating (not rounding) excess decimals.

**Example**: For GAIA.ATOM (6 decimals):
- Input: `10.123456789`
- Normalized: `10.123456`

#### Step 3: Reference ID Embedding
The reference ID is embedded in the last decimal places according to `reference_length`.

**Example**: Reference `00041` with BTC (8 decimals):
- Base: `1.50000000`
- Embedded: `1.50000041`

#### Step 4: Increment if Necessary
If the embedded amount is lower than or equal to the requested amount, increment the digit before the reference ID until the suggested amount is higher.

**Example**: GAIA.ATOM with reference `00023`:
- Requested: `10.123456`
- Initial embedded: `10.100023` (lower than requested)
- Incremented: `10.200023` (higher than requested)

### Real-World Examples

#### Example 1: BTC.BTC (8 decimals)
```json
// Request
{
  "asset": "BTC.BTC",
  "memo": "=:ETH.ETH:0x742d35Cc...",
  "requested_in_asset_amount": "1.5"
}

// Response
{
  "reference": "00041",
  "decimals": 8,
  "minimum_amount_to_send": "0.00100041",
  "suggested_in_asset_amount": "1.50000041"
}
```

#### Example 2: GAIA.ATOM (6 decimals) with Truncation
```json
// Request
{
  "asset": "GAIA.ATOM",
  "memo": "DONATE:GAIA.ATOM",
  "requested_in_asset_amount": "10.123456789"
}

// Response
{
  "reference": "00023",
  "decimals": 6,
  "minimum_amount_to_send": "0.100023",
  "suggested_in_asset_amount": "10.200023"
}
```

#### Example 3: Below Minimum Amount
```json
// Request
{
  "asset": "ETH.ETH",
  "memo": "DONATE:ETH.ETH",
  "requested_in_asset_amount": "0.001"
}

// Response
{
  "reference": "00006",
  "decimals": 8,
  "minimum_amount_to_send": "0.00100006",
  "suggested_in_asset_amount": "0.00100006"
}
```

### Benefits

- **Automatic Validation**: Ensures deposits will pass THORChain memoless validation
- **User-Friendly**: Provides a clear amount to send that's always valid
- **Precision Handling**: Correctly handles different asset decimal precisions
- **Minimum Protection**: Prevents amounts below dust thresholds
- **Reference Embedding**: Guarantees proper reference ID encoding

### Usage Notes

- The `requested_in_asset_amount` field is **optional**
- When omitted, no suggested amount is calculated or returned
- The suggested amount is always formatted to the asset's decimal precision
- The algorithm handles carry-over scenarios (e.g., incrementing `9.999999` properly)
- Works with any asset supported by the memoless registration system

## 🔔 Webhook Notifications

The API automatically sends webhook notifications for registration events when properly configured.

### Configuration

Enable webhook notifications by setting these environment variables:

```bash
ENABLE_DISCORD_WEBHOOK=true
DISCORD_WEBHOOK=https://discord.com/api/webhooks/YOUR/WEBHOOK/URL

ENABLE_SLACK_WEBHOOK=false
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

### Notification Triggers

#### Success Notifications (🟢 Green)
Triggered when `/api/v1/register` completes successfully:

**Discord/Slack Content:**
- 🪙 Asset: `BTC.BTC`
- 📝 Reference ID: `12345`
- 🌐 Network: `STAGENET`
- 💰 Hot Wallet RUNE Balance: `1.25 RUNE`
- 💳 Hot Wallet: `sthor1address...`
- 🔗 Transaction Hash: `tx_hash`
- 📄 Memo: `=:THOR.RUNE`
- 🆔 Registration ID: `uuid-string`
- ⏰ Timestamp: `2024-10-28T18:01:54.000Z`

#### Failure Notifications (🔴 Red)
Triggered when `/api/v1/register` fails:

**Discord/Slack Content:**
- 🪙 Asset: `BTC.BTC`
- 🌐 Network: `STAGENET`
- 💰 Hot Wallet RUNE Balance: `1.25 RUNE`
- 💳 Hot Wallet: `sthor1address...`
- 🔗 Transaction Hash: `tx_hash` or `Transaction failed to submit`
- 📄 Intended Memo: `invalid-memo`
- ❌ Error: `Failed to retrieve memo reference after transaction`
- 🔍 Error Details: `memo not found in thorchain records`
- ⏰ Timestamp: `2024-10-28T18:01:54.000Z`

### Notification Features

- **Non-blocking**: Webhook failures don't affect API functionality
- **Comprehensive**: Includes all relevant transaction and system information
- **Real-time**: Sent immediately when events occur
- **Balance monitoring**: Always includes current hot wallet RUNE balance
- **Color-coded**: Green for success, red for failures (Discord)
- **Structured**: Rich embeds (Discord) or formatted blocks (Slack)

## 🚨 Error Codes

### Registration Errors

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `MISSING_PARAMETERS` | Required parameters missing | 400 |
| `INVALID_ASSET_FORMAT` | Asset format incorrect | 400 |
| `UNSUPPORTED_ASSET` | Asset not available | 400 |
| `EMPTY_MEMO` | Memo cannot be empty | 400 |
| `REGISTRATION_FAILED` | Registration process failed | 500 |
| `DUPLICATE_REGISTRATION` | Already registered | 409 |

### Database-related Errors

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `REGISTRATION_NOT_FOUND` | Registration ID not found | 404 |
| `DATABASE_DISABLED` | Database not configured | 400 |

### Preflight Errors

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `MISSING_AMOUNT` | Amount parameter required | 400 |
| `PREFLIGHT_FAILED` | Validation failed | 400 |

## 🔧 Rate Limiting

- **Default**: 100 requests per 15 minutes per IP address
- **Configurable**: Set `RATE_LIMIT` environment variable
- **Response**: HTTP 429 when rate limit exceeded

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests from this IP, please try again later."
  }
}
```

## 🛠️ Development Notes

### Database Modes

The API supports three database modes:

1. **PostgreSQL**: Recommended for production
2. **SQLite**: Good for development and testing
3. **No Database**: Functional but no persistence

When no database is configured:
- Health endpoint shows `"database": {"enabled": false, "type": "none"}`
- Registration status lookups return 404
- Preflight checks with `internal_api_id` return helpful error messages

### Testing

Use the included test suite to verify functionality:

```bash
npm test
```

Tests cover:
- Registration success/failure scenarios
- Webhook notification triggers
- Database optional functionality
- Preflight validation
- Asset listing

## 📚 OpenAPI Specification

The API provides OpenAPI/Swagger documentation at:

- **JSON**: `/api/openapi.json`
- **YAML**: `/api/openapi.yaml`
- **UI**: `/docs` (Swagger UI)

Visit `/docs` in your browser for interactive API documentation.