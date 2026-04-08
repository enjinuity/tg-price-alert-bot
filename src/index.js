// Entry point for the Telegram bot.
// Commands:
// - /start
// - /alert <symbol> <price>
// - /list
// - /clear

require("dns").setDefaultResultOrder("ipv4first");

require("dotenv").config();

const { HttpsProxyAgent } = require("https-proxy-agent");
const { Telegraf, session, Markup } = require("telegraf");
const { loadAlerts, saveAlerts, ALERTS_FILE } = require("./alertsStore");
const { getUsdPrice } = require("./coingecko");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN. Create a .env file (see .env.example). ");
  process.exit(1);
}

const telegramOptions = {};
const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.TELEGRAM_HTTPS_PROXY ||
  process.env.telegram_https_proxy;

if (proxyUrl) {
  telegramOptions.agent = new HttpsProxyAgent(proxyUrl);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN, { telegram: telegramOptions });

bot.use(session());

function getCheckIntervalMs() {
  const raw = process.env.PRICE_CHECK_INTERVAL_SECONDS;
  const seconds = raw ? Number(raw) : 60;

  if (!Number.isFinite(seconds) || seconds <= 0) return 60_000;

  const clampedSeconds = Math.min(Math.max(seconds, 5), 3600);
  return Math.round(clampedSeconds * 1000);
}

const CHECK_INTERVAL_MS = getCheckIntervalMs();
let checkInProgress = false;

function nowStamp() {
  return new Date().toISOString();
}

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

function parseSymbolAndPrice(text) {
  const parts = String(text || "").trim().split(/\s+/);
  const symbol = parts[0];
  const target = Number(parts[1]);

  if (!symbol || !Number.isFinite(target)) {
    return { ok: false };
  }

  return { ok: true, symbol, targetPrice: target };
}

function menuKeyboard() {
  return Markup.keyboard([
    ["Create alert", "List alerts"],
    ["Remove alert", "Clear alerts"],
    ["Help"]
  ])
    .resize()
    .selective();
}

async function handleCreateAlert(ctx, symbol, targetPrice) {
  const chatId = ctx.chat.id;

  try {
    const { symbol: normalizedSymbol, price: currentPrice } = await getUsdPrice(symbol);

    const alerts = await loadAlerts();
    alerts.push({
      id: makeAlertId(),
      chatId,
      symbol: normalizedSymbol,
      targetPrice,
      initialPrice: currentPrice,
      lastPrice: currentPrice,
      createdAt: new Date().toISOString()
    });
    await saveAlerts(alerts);

    await ctx.reply(
      [
        `Alert saved for ${normalizedSymbol}.`,
        `Current: ${formatNumber(currentPrice)}`,
        `Target:  ${formatNumber(targetPrice)}`,
        "Trigger when price crosses the target (up or down).",
        `Checks run every ${Math.round(CHECK_INTERVAL_MS / 1000)}s.`,
        `Stored in: ${ALERTS_FILE}`
      ].join("\n")
    );

    setTimeout(() => {
      checkAlertsOnce({ reason: "new-alert" }).catch((err) => console.error("New alert check failed:", err));
    }, 1500);
  } catch (err) {
    await ctx.reply(`Could not create alert: ${err.message}`);
  }
}

async function handleListAlerts(ctx) {
  const chatId = ctx.chat.id;
  const alerts = await loadAlerts();
  const mine = alerts.filter((a) => a.chatId === chatId);

  if (mine.length === 0) {
    await ctx.reply("You have no alerts. Try: /alert BTC 95000");
    return;
  }

  const lines = mine.map((a, i) => {
    const last = Number.isFinite(Number(a.lastPrice))
      ? Number(a.lastPrice)
      : Number.isFinite(Number(a.initialPrice))
        ? Number(a.initialPrice)
        : NaN;
    const side = Number.isFinite(last)
      ? last >= Number(a.targetPrice)
        ? "(currently above target)"
        : "(currently below target)"
      : "";

    const lastPart = Number.isFinite(last) ? `last ${formatNumber(last)}` : "";
    return `${i + 1}. ${a.symbol} target ${formatNumber(a.targetPrice)} ${lastPart} ${side}`.trim();
  });

  await ctx.reply(["Your alerts:", ...lines].join("\n"));
}

async function handleRemoveAlertByIndex(ctx, index) {
  const chatId = ctx.chat.id;
  const alerts = await loadAlerts();
  const mine = alerts.filter((a) => a.chatId === chatId);

  const alertToRemove = mine[index - 1];
  if (!alertToRemove) {
    await ctx.reply("That number does not match any alert. Use /list to see numbers.");
    return;
  }

  const remaining = alerts.filter((a) => a.id !== alertToRemove.id);
  await saveAlerts(remaining);
  await ctx.reply(
    `Removed alert #${index}: ${alertToRemove.symbol} target ${formatNumber(alertToRemove.targetPrice)}.`
  );
}

async function sendHelp(ctx) {
  await ctx.reply(
    [
      "Commands:",
      "/alert <symbol> <price>  (example: /alert BTC 95000)",
      "/list",
      "/remove <number>",
      "/clear",
      "/menu",
      "",
      `Checks run every ${Math.round(CHECK_INTERVAL_MS / 1000)}s.`,
      "",
      "Data provided by CoinGecko (https://www.coingecko.com)"
    ].join("\n"),
    menuKeyboard()
  );
}

bot.start(async (ctx) => {
  await ctx.reply(
    "Welcome! Use the menu below, or type /help for commands.",
    menuKeyboard()
  );
  await sendHelp(ctx);
});

bot.command("help", sendHelp);

bot.command("menu", async (ctx) => {
  await ctx.reply("Menu enabled.", menuKeyboard());
});

bot.hears("Help", sendHelp);

bot.hears("Create alert", async (ctx) => {
  ctx.session.flow = { type: "create_alert" };
  await ctx.reply("Send: SYMBOL PRICE (example: BTC 95000)");
});

bot.hears("List alerts", async (ctx) => {
  await handleListAlerts(ctx);
});

bot.hears("Remove alert", async (ctx) => {
  ctx.session.flow = { type: "remove_alert" };
  await ctx.reply("Send the alert number to remove (see /list). Example: 2");
});

bot.hears("Clear alerts", async (ctx) => {
  await ctx.reply(
    "Clear ALL your alerts?",
    Markup.inlineKeyboard([
      Markup.button.callback("Yes, clear", "clear_yes"),
      Markup.button.callback("Cancel", "clear_no")
    ])
  );
});

bot.action("clear_yes", async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const alerts = await loadAlerts();
    const remaining = alerts.filter((a) => a.chatId !== chatId);
    const removedCount = alerts.length - remaining.length;
    await saveAlerts(remaining);
    await ctx.editMessageText(`Removed ${removedCount} alert(s).`);
  } catch {
    await ctx.reply("Could not clear alerts.");
  }
});

bot.action("clear_no", async (ctx) => {
  try {
    await ctx.editMessageText("Canceled.");
  } catch {
    await ctx.reply("Canceled.");
  }
});

bot.command("alert", async (ctx) => {
  const parsed = parseAlertCommand(ctx.message?.text);
  if (!parsed.ok) {
    await ctx.reply("Usage: /alert <symbol> <price> (example: /alert BTC 95000)");
    return;
  }

  await handleCreateAlert(ctx, parsed.symbol, parsed.targetPrice);
});

bot.command("list", async (ctx) => {
  await handleListAlerts(ctx);
});

bot.command("remove", async (ctx) => {
  const parts = String(ctx.message?.text || "").trim().split(/\s+/);
  const index = Number(parts[1]);

  if (!Number.isInteger(index) || index <= 0) {
    await ctx.reply("Usage: /remove <number> (see /list)");
    return;
  }

  await handleRemoveAlertByIndex(ctx, index);
});

bot.command("clear", async (ctx) => {
  const chatId = ctx.chat.id;
  const alerts = await loadAlerts();

  const remaining = alerts.filter((a) => a.chatId !== chatId);
  const removedCount = alerts.length - remaining.length;

  await saveAlerts(remaining);
  await ctx.reply(`Removed ${removedCount} alert(s).`);
});

bot.on("text", async (ctx, next) => {
  const flow = ctx.session.flow;
  const text = String(ctx.message?.text || "").trim();

  if (!flow || text.startsWith("/")) {
    return next();
  }

  if (flow.type === "create_alert") {
    const parsed = parseSymbolAndPrice(text);
    if (!parsed.ok) {
      await ctx.reply("Send: SYMBOL PRICE (example: BTC 95000)");
      return;
    }

    ctx.session.flow = null;
    await handleCreateAlert(ctx, parsed.symbol, parsed.targetPrice);
    return;
  }

  if (flow.type === "remove_alert") {
    const n = Number(text);
    if (!Number.isInteger(n) || n <= 0) {
      await ctx.reply("Send a number from /list. Example: 2");
      return;
    }

    ctx.session.flow = null;
    await handleRemoveAlertByIndex(ctx, n);
    return;
  }

  return next();
});

bot.command("check", async (ctx) => {
  const result = await checkAlertsOnce({ reason: "manual" });
  await ctx.reply(
    `Checked prices. Alerts: ${result.totalAlerts}, updated: ${result.updatedAlerts}, triggered: ${result.triggeredAlerts}.`
  );
});

async function checkAlertsOnce({ reason } = {}) {
  if (checkInProgress) {
    return {
      totalAlerts: 0,
      updatedAlerts: 0,
      triggeredAlerts: 0,
      skipped: true
    };
  }

  checkInProgress = true;

  try {
    const alerts = await loadAlerts();
    if (alerts.length === 0) {
      return { totalAlerts: 0, updatedAlerts: 0, triggeredAlerts: 0 };
    }

    console.log(`[${nowStamp()}] check start (${reason || "interval"}) alerts=${alerts.length}`);

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
    const nextAlerts = [];
    let didUpdate = false;
    let updatedAlerts = 0;

    for (const alert of alerts) {
      const current = pricesBySymbol.get(alert.symbol);
      if (!Number.isFinite(current)) {
        nextAlerts.push(alert);
        continue;
      }

      const target = Number(alert.targetPrice);
      const last = Number.isFinite(Number(alert.lastPrice))
        ? Number(alert.lastPrice)
        : Number.isFinite(Number(alert.initialPrice))
          ? Number(alert.initialPrice)
          : current;

      const crossedUp = last < target && current >= target;
      const crossedDown = last > target && current <= target;
      const shouldTrigger = crossedUp || crossedDown;

      if (shouldTrigger) {
        triggered.push({ alert, current, direction: crossedUp ? "above" : "below" });
      } else {
        const nextAlert = { ...alert, lastPrice: current };
        if (Number(alert.lastPrice) !== current) {
          didUpdate = true;
          updatedAlerts += 1;
        }
        nextAlerts.push(nextAlert);
      }
    }

    let triggeredAlerts = 0;

    for (const { alert, current, direction } of triggered) {
      const message = [
        `Alert triggered for ${alert.symbol}!`,
        `Current: ${formatNumber(current)}`,
        `Target:  ${formatNumber(alert.targetPrice)}`,
        `Price is now ${direction} your target.`,
        "(This alert was removed.)"
      ].join("\n");

      try {
        await bot.telegram.sendMessage(alert.chatId, message);
        triggeredAlerts += 1;
      } catch (err) {
        nextAlerts.push(alert);
        console.error("Failed to send Telegram message:", err.message);
      }
    }

    if (triggeredAlerts > 0 || didUpdate || triggeredAlerts !== triggered.length) {
      await saveAlerts(nextAlerts);
    }

    console.log(
      `[${nowStamp()}] check done alerts=${alerts.length} updated=${updatedAlerts} triggered=${triggeredAlerts}/${triggered.length}`
    );

    return {
      totalAlerts: alerts.length,
      updatedAlerts,
      triggeredAlerts
    };
  } finally {
    checkInProgress = false;
  }
}

console.log(
  `Starting bot (${nowStamp()}). Price checks scheduled every ${Math.round(CHECK_INTERVAL_MS / 1000)} seconds...`
);

setTimeout(() => {
  checkAlertsOnce({ reason: "startup" }).catch((err) => console.error("Initial check failed:", err));
}, 2_000);

setInterval(() => {
  checkAlertsOnce({ reason: "interval" }).catch((err) => console.error("Check failed:", err));
}, CHECK_INTERVAL_MS);

async function launchWithRetry() {
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      await bot.launch();
      console.log(`Bot launched (${nowStamp()}).`);
      return;
    } catch (err) {
      const delayMs = Math.min(60_000, attempt * 10_000);
      console.error("Bot failed to launch:", err);
      console.error(
        `This usually means your network can't reach Telegram (or Telegram is blocked). If needed, set HTTPS_PROXY in .env. Retrying in ${Math.round(
          delayMs / 1000
        )}s...`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

launchWithRetry();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
