# Telegram Crypto Price Alert Bot (Minimal)

A tiny Telegram bot written in Node.js using **Telegraf**.

It stores alerts in a local JSON file and checks prices every 60 seconds using the **CoinGecko API**.

## Features

- `/start` — show help
- `/alert <symbol> <price>` — create an alert
  - Example: `/alert BTC 95000`
- `/list` — list your alerts
- `/clear` — remove all your alerts

Prices are fetched in **USD** (CoinGecko). If you type `BTC`, the bot searches CoinGecko and uses the best match.

## Requirements

- Node.js 18+ (for built-in `fetch`)
- A Telegram bot token from `@BotFather`

## Setup

1) Install dependencies

```bash
npm install
```

2) Create your `.env`

```bash
cp .env.example .env
```

3) Set your token in `.env`

```bash
TELEGRAM_BOT_TOKEN=YOUR_TOKEN_HERE
```

4) Set your CoinGecko API key in `.env`

```bash
COINGECKO_API_KEY=YOUR_COINGECKO_KEY_HERE
```

## Run

```bash
npm start
```

## Usage

In Telegram, open your bot and try:

- `/start`
- `/alert BTC 95000`
- `/list`
- `/clear`

## Where alerts are stored

Alerts live in `data/alerts.json`.
