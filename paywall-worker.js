// CLOUDFLARE WORKER CODE (The Gatekeeper)
// This worker intercepts requests at the edge and checks for payment proofs

const RPC_URL = "https://30732.rpc.thirdweb.com"; // Movement Testnet
// You can also use: "https://full.testnet.movementinfra.xyz/v1"

// Configuration - These should be set via Cloudflare Worker environment variables
// For now, they're hardcoded but should be replaced with env vars in production
const MY_WALLET = "0xea859ca79b267afdb7bd7702cd93c4e7c0db16ecaca862fb38c63d928f821a1b"; // Where you want to receive the MOVE
const PRICE_MOVE = 0.01;
const PRICE_WEI = BigInt(PRICE_MOVE * 1e18); // Assuming 18 decimals

export default {
  async fetch(request, env, ctx) {
    // 1. Check if the user is trying to bypass with a Payment Proof
    const txHash = request.headers.get("X-Payment-Hash");

    if (!txHash) {
      // NO PAYMENT? -> Return 402 with instructions
      return new Response(
        JSON.stringify({
          error: "Payment Required",
          message: "Pay 0.01 MOVE to access this resource.",
          payment_address: MY_WALLET,
          price_move: PRICE_MOVE,
          chain_id: 30732,
        }),
        {
          status: 402,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 2. VERIFY THE PAYMENT ON-CHAIN
    try {
      const isValid = await verifyPayment(txHash);
      if (isValid) {
        // PAYMENT VALID! -> Fetch the actual hidden content
        // In a real app, you would fetch(request) to your origin server here.
        // For this demo, we return the secret data directly.
        return new Response("🔓 ACCESS GRANTED: Here is your scraped data.", {
          status: 200,
        });
      } else {
        return new Response("❌ Invalid or Insufficient Payment", { status: 403 });
      }
    } catch (e) {
      return new Response(`RPC Error: ${e.message}`, { status: 500 });
    }
  },
};

// Helper to query Movement RPC
async function verifyPayment(txHash) {
  const payload = {
    jsonrpc: "2.0",
    method: "eth_getTransactionByHash",
    params: [txHash],
    id: 1,
  };

  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  const tx = data.result;

  if (!tx) return false;

  // CHECKS:
  // 1. Is the receiver correct?
  const toValid = tx.to.toLowerCase() === MY_WALLET.toLowerCase();

  // 2. Is the amount correct? (Value is in Hex Wei)
  const valueWei = BigInt(tx.value);
  const amountValid = valueWei >= PRICE_WEI;

  // 3. (Optional) Check 'eth_getTransactionReceipt' to ensure it didn't fail
  // For speed, we are just checking the submitted tx here.
  return toValid && amountValid;
}

