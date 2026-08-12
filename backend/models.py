"""Database layer for the subscription tracker.

Uses plain sqlite3 (no ORM) to keep dependencies minimal. Each subscription
stores a `next_payment_date`; whenever subscriptions are read, any date that
has passed is rolled forward to the next occurrence based on the billing
cycle, so the app always reflects "what's actually next" without requiring
manual upkeep.
"""
import calendar
import sqlite3
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

DB_PATH = None  # set by app.py via init_app()

VALID_CYCLES = {"weekly", "monthly", "yearly", "custom", "last_business_day"}

# How many times per year a subscription bills, used for spending totals.
OCCURRENCES_PER_YEAR = {
    "weekly": 52,
    "monthly": 12,
    "yearly": 1,
    "last_business_day": 12,
}


def _last_weekday_of_month(year, month):
    """Return the last Mon-Fri date in the given month."""
    last_day = calendar.monthrange(year, month)[1]
    d = date(year, month, last_day)
    while d.weekday() >= 5:  # 5=Saturday, 6=Sunday
        d -= timedelta(days=1)
    return d


def init_app(db_path):
    global DB_PATH
    DB_PATH = db_path


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            cost REAL NOT NULL,
            currency TEXT NOT NULL DEFAULT 'SEK',
            billing_cycle TEXT NOT NULL,
            custom_days INTEGER,
            next_payment_date TEXT NOT NULL,
            category TEXT,
            notes TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def _advance_date(d, billing_cycle, custom_days):
    """Return the next occurrence of d strictly after today, per cycle."""
    if billing_cycle == "last_business_day":
        next_month = d + relativedelta(months=1)
        return _last_weekday_of_month(next_month.year, next_month.month)
    if billing_cycle == "weekly":
        step = timedelta(weeks=1)
    elif billing_cycle == "monthly":
        step = relativedelta(months=1)
    elif billing_cycle == "yearly":
        step = relativedelta(years=1)
    elif billing_cycle == "custom":
        step = timedelta(days=max(1, custom_days or 1))
    else:
        raise ValueError(f"Unknown billing cycle: {billing_cycle}")
    return d + step


def roll_forward_if_past(row_dict, today=None):
    """Given a subscription dict, advance next_payment_date until it's
    today or in the future. Returns (updated_dict, changed: bool)."""
    today = today or date.today()
    d = date.fromisoformat(row_dict["next_payment_date"])
    changed = False
    # Safety cap to avoid pathological infinite loops on bad data.
    for _ in range(1000):
        if d >= today:
            break
        d = _advance_date(d, row_dict["billing_cycle"], row_dict.get("custom_days"))
        changed = True
    if changed:
        row_dict["next_payment_date"] = d.isoformat()
    return row_dict, changed


def occurrences_per_year(billing_cycle, custom_days):
    if billing_cycle == "custom":
        days = max(1, custom_days or 30)
        return 365.0 / days
    return OCCURRENCES_PER_YEAR[billing_cycle]


def row_to_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "cost": row["cost"],
        "currency": row["currency"],
        "billing_cycle": row["billing_cycle"],
        "custom_days": row["custom_days"],
        "next_payment_date": row["next_payment_date"],
        "category": row["category"],
        "notes": row["notes"],
        "created_at": row["created_at"],
    }


def list_subscriptions(sync_dates=True):
    """Return all subscriptions as dicts, rolling forward (and persisting)
    any next_payment_date that has passed."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM subscriptions ORDER BY next_payment_date ASC").fetchall()
    result = []
    for row in rows:
        d = row_to_dict(row)
        if sync_dates:
            d, changed = roll_forward_if_past(d)
            if changed:
                conn.execute(
                    "UPDATE subscriptions SET next_payment_date = ? WHERE id = ?",
                    (d["next_payment_date"], d["id"]),
                )
        result.append(d)
    if sync_dates:
        conn.commit()
    conn.close()
    return result


def get_subscription(sub_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM subscriptions WHERE id = ?", (sub_id,)).fetchone()
    conn.close()
    return row_to_dict(row) if row else None


def create_subscription(data):
    conn = get_db()
    cur = conn.execute(
        """
        INSERT INTO subscriptions
            (name, cost, currency, billing_cycle, custom_days, next_payment_date, category, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["name"],
            data["cost"],
            data.get("currency") or "SEK",
            data["billing_cycle"],
            data.get("custom_days"),
            data["next_payment_date"],
            data.get("category"),
            data.get("notes"),
            date.today().isoformat(),
        ),
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return get_subscription(new_id)


def update_subscription(sub_id, data):
    existing = get_subscription(sub_id)
    if not existing:
        return None
    merged = {**existing, **data}
    conn = get_db()
    conn.execute(
        """
        UPDATE subscriptions
        SET name = ?, cost = ?, currency = ?, billing_cycle = ?, custom_days = ?,
            next_payment_date = ?, category = ?, notes = ?
        WHERE id = ?
        """,
        (
            merged["name"],
            merged["cost"],
            merged["currency"],
            merged["billing_cycle"],
            merged.get("custom_days"),
            merged["next_payment_date"],
            merged.get("category"),
            merged.get("notes"),
            sub_id,
        ),
    )
    conn.commit()
    conn.close()
    return get_subscription(sub_id)


def delete_subscription(sub_id):
    conn = get_db()
    cur = conn.execute("DELETE FROM subscriptions WHERE id = ?", (sub_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0
