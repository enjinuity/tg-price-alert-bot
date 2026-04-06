// Minimal CoinGecko price helper.
// CoinGecko usually identifies coins by an "id" (like "bitcoin"), not by ticker (like "BTC").
// To keep the bot easy to use, we:
// 1) Search for the coin id by your symbol (BTC, ETH, etc.)
// 2) Fetch the USD price using the "simple/price" endpoint

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

const coinIdCache = new Map();

function normalizeSymbol(input) {
  return String(input || "").trim().toUpperCase();
}

function coingeckoHeaders() {
  const headers = {
    accept: "application/json"
  };

  if (COINGECKO_API_KEY) {
    headers["x-cg-pro-api-key"] = COINGECKO_API_KEY;
  }

  return headers;
}

async function resolveCoinIdBySymbol(symbolInput) {
  const symbol = normalizeSymbol(symbolInput);
  if (!symbol) throw new Error("Missing symbol");

  const cached = coinIdCache.get(symbol);
  if (cached) return cached;

  const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, { headers: coingeckoHeaders() });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CoinGecko API error (${res.status}): ${text || "request failed"}`);
  }

  const data = await res.json();
  const coins = Array.isArray(data.coins) ? data.coins : [];

  const exactSymbolMatch = coins.find(
    (c) => String(c.symbol || "").trim().toUpperCase() === symbol
  );
  const best = exactSymbolMatch || coins[0];

  if (!best?.id) {
    throw new Error(`Unknown symbol: ${symbol}`);
  }

  coinIdCache.set(symbol, best.id);
  return best.id;
}

async function getUsdPrice(symbolInput) {
  const symbol = normalizeSymbol(symbolInput);
  const coinId = await resolveCoinIdBySymbol(symbol);

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd`;
  const res = await fetch(url, { headers: coingeckoHeaders() });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CoinGecko API error (${res.status}): ${text || "request failed"}`);
  }

  const data = await res.json();
  const price = Number(data?.[coinId]?.usd);
  if (!Number.isFinite(price)) {
    throw new Error(`No USD price available for ${symbol}`);
  }

  return { symbol, coinId, price };
}

module.exports = {
  getUsdPrice
};

