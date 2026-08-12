# Subscription Tracker

A small local web app for keeping track of your subscriptions: what you have,
what each one costs, how often it bills, and which day the money comes out.

This app is built using Claude Code, to get familiar with the tool and learn what can be done and how it can be used efficiently

## Features

- Add, edit, and delete subscriptions (name, cost, currency, billing cycle, next payment date, category, notes)
- Billing cycles: weekly, monthly, quarterly, yearly, or a custom "every N days"
- Automatically rolls a subscription's next payment date forward as time passes, so it always reflects what's actually next
- Dashboard showing:
  - Upcoming payments in the next 7 days
  - Monthly and annual spending totals
  - Spending broken down by category
- Data is stored locally in a SQLite file — nothing leaves your machine

## Requirements

- Python 3.9+

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate      # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
cd backend
source .venv/bin/activate      # if not already active
python app.py
```

Then open **http://127.0.0.1:5000** in your browser.

The app creates a `subscriptions.db` SQLite file in the `backend/` folder
the first time it runs — this is where all your data lives. It's excluded
from git via `.gitignore` so your personal subscription data never gets
committed.

## Project structure

```
subscription-tracker/
├── backend/
│   ├── app.py           # Flask app + API routes
│   ├── models.py        # SQLite data layer
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── README.md
```

## API

| Method | Path                     | Description                          |
|--------|---------------------------|--------------------------------------|
| GET    | `/api/subscriptions`      | List all subscriptions               |
| POST   | `/api/subscriptions`      | Create a subscription                |
| PUT    | `/api/subscriptions/<id>` | Update a subscription                |
| DELETE | `/api/subscriptions/<id>` | Delete a subscription                |
| GET    | `/api/upcoming?days=7`    | Subscriptions due within N days      |
| GET    | `/api/summary`            | Spending totals and category breakdown |

## Ideas for later

- Currency conversion for subscriptions in different currencies
- Email/push reminders before a payment
- Yearly spend chart over time
- Multi-user support with accounts
