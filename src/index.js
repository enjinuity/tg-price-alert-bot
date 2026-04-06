// Entry point for the Telegram bot.
// Commands:
// - /start
// - /alert <symbol> <price>
// - /list
// - /clear

require("dotenv").config();

const { Telegraf } = require("telegraf");
const { loadAlerts, saveAlerts, ALERTS_FILE } = require("./alertsStore");
const { getUsdPrice } = require("./coingecko");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN. Create a .env file (see .env.example). ");
  process.exit(1);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

function formatNumber(n) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 8
  }).format(n);
}

function makeAlertId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseAlertCommand(text) {
  const parts = String(text || "").trim().split(/\s+/);
  const symbol = parts[1];
  const target = Number(parts[2]);

  if (!symbol || !Number.isFinite(target)) {
    return { ok: false };
  }

  return { ok: true, symbol, targetPrice: target };
}

bot.start(async (ctx) => {
  await ctx.reply(
    [
      "Welcome! I can alert you when a crypto price crosses a target.",
      "",
      "Commands:",
      "/alert <symbol> <price>  (example: /alert BTC 95000)",
      "/list",
      "/clear"
    ].join("\n")
  );
});

bot.command("alert", async (ctx) => {
  const chatId = ctx.chat.id;
  const parsed = parseAlertCommand(ctx.message?.text);
  if (!parsed.ok) {
    await ctx.reply("Usage: /alert <symbol> <price> (example: /alert BTC 95000)");
    return;
  }

  try {
    const { symbol, price: currentPrice } = await getUsdPrice(parsed.symbol);
    const direction = parsed.targetPrice > currentPrice ? "above" : "below";

    const alerts = await loadAlerts();
    alerts.push({
      id: makeAlertId(),
      chatId,
      symbol,
      targetPrice: parsed.targetPrice,
      initialPrice: currentPrice,
      direction,
      createdAt: new Date().toISOString()
    });
    await saveAlerts(alerts);

    await ctx.reply(
      [
        `Alert saved for ${symbol}.`,
        `Current: ${formatNumber(currentPrice)}`,
        `Target:  ${formatNumber(parsed.targetPrice)}`,
        `Trigger when price goes ${direction} the target.`,
        `Stored in: ${ALERTS_FILE}`
      ].join("\n")
    );
  } catch (err) {
    await ctx.reply(`Could not create alert: ${err.message}`);
  }
});

bot.command("list", async (ctx) => {
  const chatId = ctx.chat.id;
  const alerts = await loadAlerts();
  const mine = alerts.filter((a) => a.chatId === chatId);

  if (mine.length === 0) {
    await ctx.reply("You have no alerts. Try: /alert BTC 95000");
    return;
  }

  const lines = mine.map((a, i) => {
    const arrow = a.direction === "above" ? "↑" : "↓";
    return `${i + 1}. ${a.symbol} ${arrow} ${formatNumber(a.targetPrice)} (created ${a.createdAt})`;
  });

  await ctx.reply(["Your alerts:", ...lines].join("\n"));
});

bot.command("clear", async (ctx) => {
  const chatId = ctx.chat.id;
  const alerts = await loadAlerts();

  const remaining = alerts.filter((a) => a.chatId !== chatId);
  const removedCount = alerts.length - remaining.length;

  await saveAlerts(remaining);
  await ctx.reply(`Removed ${removedCount} alert(s).`);
});

async function checkAlertsOnce() {
  const alerts = await loadAlerts();
  if (alerts.length === 0) return;

  const uniqueSymbols = [...new Set(alerts.map((a) => a.symbol))];
  const pricesBySymbol = new Map();

  for (const symbol of uniqueSymbols) {
    try {
      const { price } = await getUsdPrice(symbol);
      pricesBySymbol.set(symbol, price);
    } catch (err) {
      console.error(`Price fetch failed for ${symbol}:`, err.message);
    }
  }

  const triggered = [];
  const remaining = [];

  for (const alert of alerts) {
    const current = pricesBySymbol.get(alert.symbol);
    if (!Number.isFinite(current)) {
      remaining.push(alert);
      continue;
    }

    const shouldTrigger =
      (alert.direction === "above" && current >= alert.targetPrice) ||
      (alert.direction === "below" && current <= alert.targetPrice);

    if (shouldTrigger) {
      triggered.push({ alert, current });
    } else {
      remaining.push(alert);
    }
  }

  if (triggered.length > 0) {
    await saveAlerts(remaining);
  }

  for (const { alert, current } of triggered) {
    const directionWord = alert.direction === "above" ? "above" : "below";
    const message = [
      `Alert triggered for ${alert.symbol}!`,
      `Current: ${formatNumber(current)}`,
      `Target:  ${formatNumber(alert.targetPrice)}`,
      `Price is now ${directionWord} your target.`,
      "(This alert was removed.)"
    ].join("\n");

    try {
      await bot.telegram.sendMessage(alert.chatId, message);
    } catch (err) {
      console.error("Failed to send Telegram message:", err.message);
    }
  }
}

bot.launch().then(() => {
  console.log("Bot started. Checking prices every 60 seconds...");
  setInterval(() => {
    checkAlertsOnce().catch((err) => console.error("Check failed:", err));
  }, 60_000);

  setTimeout(() => {
    checkAlertsOnce().catch((err) => console.error("Initial check failed:", err));
  }, 2_000);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
