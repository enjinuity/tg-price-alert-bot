# Telegram Crypto Price Alert Bot (Minimal)

A tiny Telegram bot written in Node.js using **Telegraf**.

It stores alerts in a local JSON file and checks prices every n seconds using the **CoinGecko API**.

## Features

- `/start` — show help
- `/status` — show bot status (polling interval, alert count, proxy)
- `/alert <symbol> <price>` — create an alert
  - Example: `/alert BTC 95000`
- `/alert <symbol> above <price>` — trigger when price crosses above the target
  - Example: `/alert BTC above 95000`
- `/alert <symbol> below <price>` — trigger when price crosses below the target
  - Example: `/alert BTC below 90000`
- `/list` — list your alerts
- `/clear` — remove all your alerts

Prices are fetched in **USD** (CoinGecko). If you type `BTC`, the bot searches CoinGecko and uses the best match.

## Requirements

- Node.js 18+ (for built-in `fetch`)
- A Telegram bot token from `@BotFather`

## Setup

1. Install dependencies

```bash
npm install
```

1. Create your `.env`

```bash
cp .env.example .env
```

1. Set your token in `.env`

```bash
TELEGRAM_BOT_TOKEN=YOUR_TOKEN_HERE
```

1. Set your CoinGecko API key in `.env`

```bash
COINGECKO_API_KEY=YOUR_COINGECKO_KEY_HERE
```

## Polling interval (optional)

By default, the bot checks prices every **60 seconds**.

If you want to check more frequently (helps catch fast spikes/dips), set this in `.env`:

```bash
PRICE_CHECK_INTERVAL_SECONDS=15
```

Minimum is 5 seconds.

## Debug tip

You can run `/check` in Telegram to force an immediate price check and see a summary.

## If the bot cant connect to Telegram (timeout)

If you see an error like:

`Bot failed to launch ... ETIMEDOUT ... api.telegram.org`

your network is blocking Telegram (or has restricted outbound access). The bot cannot run until Telegram API is reachable.

Options:

- Use a VPN
- Run the bot on a server/network where Telegram is reachable
- Use an HTTPS proxy by setting `HTTPS_PROXY` in `.env`, for example:

```bash
HTTPS_PROXY=http://127.0.0.1:7890
```

## Run

```bash
npm start
```

## Usage

In Telegram, open your bot and try:

- `/start`
- `/price BTC`
- `/status`
- `/alert BTC 95000`
- `/alert BTC above 95000`
- `/list`
- `/remove 1`
- `/clear`

Tip: `/start` also shows a simple menu (buttons) for common actions.

## Where alerts are stored

Alerts live in `data/alerts.json`.

## Attribution

Data provided by CoinGecko (<https://www.coingecko.com>)
