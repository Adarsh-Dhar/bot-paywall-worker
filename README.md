# Cloudflare Worker x402 Paywall

This Cloudflare Worker implements a payment gate (x402) that intercepts requests at the edge and requires blockchain payment proofs before allowing access to protected resources.

## Overview

The worker sits at the edge of Cloudflare's network and:
1. Checks for `X-Payment-Hash` header in incoming requests
2. Returns HTTP 402 (Payment Required) if no payment proof is provided
3. Verifies the payment on-chain using Movement blockchain RPC
4. Grants access if payment is valid, or returns 403 if invalid

## Setup Instructions

### 1. Prerequisites

- A Cloudflare account with Workers enabled
- A Movement blockchain wallet address to receive payments
- Access to Movement testnet RPC (or mainnet)

### 2. Configure the Worker

Edit `paywall-worker.js` and update these constants:

```javascript
const MY_WALLET = "YOUR_WALLET_ADDRESS_HERE"; // Replace with your wallet address
const PRICE_MOVE = 0.01; // Price in MOVE tokens
const RPC_URL = "https://30732.rpc.thirdweb.com"; // Movement Testnet RPC
```

**Recommended**: Use Cloudflare Worker environment variables instead of hardcoding:

1. Go to your Worker settings in Cloudflare Dashboard
2. Navigate to "Settings" > "Variables"
3. Add environment variables:
   - `MY_WALLET`: Your wallet address
   - `PRICE_MOVE`: Price in MOVE (e.g., "0.01")
   - `RPC_URL`: Movement RPC endpoint

Then update the worker code to read from `env`:

```javascript
const MY_WALLET = env.MY_WALLET || "YOUR_WALLET_ADDRESS_HERE";
const PRICE_MOVE = parseFloat(env.PRICE_MOVE || "0.01");
const RPC_URL = env.RPC_URL || "https://30732.rpc.thirdweb.com";
```

### 3. Deploy the Worker

#### Option A: Using Cloudflare Dashboard

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** > **Create Service**
3. Give your worker a name (e.g., `paywall-worker`)
4. Click **Create Service**
5. In the code editor, paste the contents of `paywall-worker.js`
6. Update the configuration constants (wallet address, price, RPC URL)
7. Click **Save and Deploy**

#### Option B: Using Wrangler CLI

1. Install Wrangler:
   ```bash
   npm install -g wrangler
   ```

2. Authenticate:
   ```bash
   wrangler login
   ```

3. Create `wrangler.toml`:
   ```toml
   name = "paywall-worker"
   main = "paywall-worker.js"
   compatibility_date = "2024-01-01"

   [vars]
   MY_WALLET = "0xYourWalletAddress"
   PRICE_MOVE = "0.01"
   RPC_URL = "https://30732.rpc.thirdweb.com"
   ```

4. Deploy:
   ```bash
   wrangler deploy
   ```

### 4. Route Configuration

After deploying, you need to route traffic through the worker:

1. Go to your Cloudflare domain
2. Navigate to **Workers & Pages** > Your Worker > **Triggers**
3. Click **Add Route**
4. Configure:
   - **Route**: `yourdomain.com/*` (or specific path like `yourdomain.com/protected/*`)
   - **Zone**: Select your domain
5. Click **Save**

### 5. Testing

Test the worker by making a request without payment proof:

```bash
curl https://yourdomain.com/protected
```

You should receive a 402 response:

```json
{
  "error": "Payment Required",
  "message": "Pay 0.01 MOVE to access this resource.",
  "payment_address": "0x...",
  "price_move": 0.01,
  "chain_id": 30732
}
```

Then use the Python scraper to make a payment and retry:

```bash
cd webscrapper
python main.py https://yourdomain.com/protected
```

## How It Works

1. **Request Interception**: The worker intercepts all requests to the configured route
2. **Payment Check**: Checks for `X-Payment-Hash` header
3. **402 Response**: If missing, returns 402 with payment instructions
4. **On-Chain Verification**: If present, queries Movement RPC to verify:
   - Transaction exists
   - Receiver address matches
   - Payment amount is sufficient
5. **Access Grant**: If valid, forwards request to origin (or returns success)

## Customization

### Forwarding to Origin Server

To forward valid requests to your origin server instead of returning a static message:

```javascript
if (isValid) {
  // Forward to origin
  return fetch(request);
}
```

### Adding Replay Protection

To prevent reuse of payment proofs, add a KV store binding:

1. Create a KV namespace in Cloudflare Dashboard
2. Bind it to your worker as `PAYMENT_KV`
3. Check and store payment hashes:

```javascript
const used = await env.PAYMENT_KV.get(`payment:${txHash}`);
if (used) {
  return new Response("Payment already used", { status: 403 });
}
await env.PAYMENT_KV.put(`payment:${txHash}`, "used", { expirationTtl: 86400 });
```

### Receipt Verification

For more robust verification, also check the transaction receipt:

```javascript
const receiptResp = await fetch(RPC_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "eth_getTransactionReceipt",
    params: [txHash],
    id: 1,
  }),
});

const receiptData = await receiptResp.json();
const receipt = receiptData.result;

if (!receipt || receipt.status !== "0x1") {
  return false; // Transaction failed
}
```

## Troubleshooting

### 403 Errors Still Occurring

- Ensure the worker is actually deployed and active
- Check that routes are properly configured
- Verify the User-Agent in your scraper matches a real browser
- Check Cloudflare WAF rules that might be blocking before the worker runs

### Payment Verification Failing

- Verify the RPC URL is correct and accessible
- Check that the transaction has been confirmed on-chain
- Ensure the payment amount matches exactly (including decimals)
- Verify the receiver address matches (case-insensitive comparison)

### Worker Not Triggering

- Check route configuration matches your domain/path
- Verify the worker is deployed (not just saved as draft)
- Check Cloudflare's worker logs for errors

## Security Considerations

- **Never expose private keys** in worker code
- Use environment variables for sensitive configuration
- Consider rate limiting to prevent abuse
- Implement replay protection for production use
- Validate all inputs before processing
- Use HTTPS only for RPC calls

## Support

For issues or questions:
- Check Cloudflare Worker logs in the dashboard
- Review Movement blockchain transaction status
- Verify RPC endpoint availability

# bot-paywall-worker
