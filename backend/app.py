"""Subscription Tracker — a small local Flask app.

Run with: python app.py
Then open http://127.0.0.1:5000 in your browser.
"""
import os
from datetime import date, timedelta

from flask import Flask, jsonify, request, send_from_directory

import models

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")
DB_PATH = os.path.join(BASE_DIR, "subscriptions.db")

models.init_app(DB_PATH)

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")


def error(message, status=400):
    return jsonify({"error": message}), status


def validate_payload(data, partial=False):
    """Validate an incoming subscription payload. Returns (cleaned, error_msg)."""
    cleaned = {}

    if not partial or "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return None, "Namn krävs"
        cleaned["name"] = name

    if not partial or "cost" in data:
        try:
            cost = float(data.get("cost"))
        except (TypeError, ValueError):
            return None, "Kostnad måste vara ett tal"
        if cost < 0:
            return None, "Kostnad kan inte vara negativ"
        cleaned["cost"] = cost

    if not partial:
        cleaned["currency"] = "SEK"

    if not partial or "billing_cycle" in data:
        cycle = data.get("billing_cycle")
        if cycle not in models.VALID_CYCLES:
            return None, f"billing_cycle måste vara en av {sorted(models.VALID_CYCLES)}"
        cleaned["billing_cycle"] = cycle

    custom_days = data.get("custom_days")
    if cleaned.get("billing_cycle") == "custom" or (partial and "custom_days" in data):
        try:
            custom_days = int(custom_days)
            if custom_days < 1:
                raise ValueError
        except (TypeError, ValueError):
            return None, "custom_days måste vara ett positivt heltal när billing_cycle är 'custom'"
        cleaned["custom_days"] = custom_days
    elif "custom_days" in data:
        cleaned["custom_days"] = None

    if not partial or "next_payment_date" in data:
        raw_date = data.get("next_payment_date")
        try:
            date.fromisoformat(raw_date)
        except (TypeError, ValueError):
            return None, "next_payment_date måste vara ett ISO-datum (ÅÅÅÅ-MM-DD)"
        cleaned["next_payment_date"] = raw_date

    if "category" in data:
        cleaned["category"] = (data.get("category") or "").strip() or None

    if "notes" in data:
        cleaned["notes"] = (data.get("notes") or "").strip() or None

    return cleaned, None


@app.route("/api/subscriptions", methods=["GET"])
def list_subscriptions():
    return jsonify(models.list_subscriptions())


@app.route("/api/subscriptions", methods=["POST"])
def create_subscription():
    data = request.get_json(silent=True) or {}
    cleaned, err = validate_payload(data, partial=False)
    if err:
        return error(err)
    created = models.create_subscription(cleaned)
    return jsonify(created), 201


@app.route("/api/subscriptions/<int:sub_id>", methods=["PUT"])
def update_subscription(sub_id):
    data = request.get_json(silent=True) or {}
    cleaned, err = validate_payload(data, partial=True)
    if err:
        return error(err)
    updated = models.update_subscription(sub_id, cleaned)
    if not updated:
        return error("prenumerationen hittades inte", 404)
    return jsonify(updated)


@app.route("/api/subscriptions/<int:sub_id>", methods=["DELETE"])
def delete_subscription(sub_id):
    ok = models.delete_subscription(sub_id)
    if not ok:
        return error("prenumerationen hittades inte", 404)
    return "", 204


@app.route("/api/upcoming", methods=["GET"])
def upcoming():
    days = request.args.get("days", default=30, type=int)
    today = date.today()
    horizon = today + timedelta(days=days)
    subs = models.list_subscriptions()
    due = [
        {**s, "days_until": (date.fromisoformat(s["next_payment_date"]) - today).days}
        for s in subs
        if today <= date.fromisoformat(s["next_payment_date"]) <= horizon
    ]
    due.sort(key=lambda s: s["next_payment_date"])
    return jsonify(due)


@app.route("/api/summary", methods=["GET"])
def summary():
    subs = models.list_subscriptions()
    total_annual = 0.0
    total_monthly = 0.0
    by_category = {}

    for s in subs:
        occ = models.occurrences_per_year(s["billing_cycle"], s.get("custom_days"))
        annual = s["cost"] * occ
        monthly = annual / 12
        total_annual += annual
        total_monthly += monthly

        cat = s.get("category") or "Okategoriserad"
        bucket = by_category.setdefault(cat, {"monthly": 0.0, "annual": 0.0, "count": 0})
        bucket["monthly"] += monthly
        bucket["annual"] += annual
        bucket["count"] += 1

    return jsonify(
        {
            "subscription_count": len(subs),
            "total_monthly": round(total_monthly, 2),
            "total_annual": round(total_annual, 2),
            "by_category": {
                cat: {
                    "monthly": round(v["monthly"], 2),
                    "annual": round(v["annual"], 2),
                    "count": v["count"],
                }
                for cat, v in sorted(by_category.items())
            },
        }
    )


@app.route("/api/trend", methods=["GET"])
def trend():
    return jsonify(models.monthly_trend())


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


if __name__ == "__main__":
    models.init_db()
    app.run(debug=True, port=5000)
