import argparse
import json
import sqlite3
from bisect import bisect_right
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_VIC_DB = Path(__file__).resolve().parents[1] / "data" / "vic_ideas.sqlite"
DEFAULT_QUICKFS_DB = Path(
    "/Users/matthewjohnson/Downloads/stock_analysis/AI_stock_scorer/data/financials.db"
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Calculate equal-weight QuickFS universe benchmarks for VIC idea holding windows."
    )
    parser.add_argument("--vic-db", type=Path, default=DEFAULT_VIC_DB)
    parser.add_argument("--quickfs-db", type=Path, default=DEFAULT_QUICKFS_DB)
    return parser.parse_args()


def load_quickfs_series(path):
    conn = sqlite3.connect(path)
    quickfs = {}

    for ticker, data_json in conn.execute("SELECT ticker, data_json FROM financials"):
        try:
            data = json.loads(data_json)
        except json.JSONDecodeError:
            continue

        dates = data.get("period_end_date") or []
        prices = data.get("period_end_price") or []
        dividends = data.get("dividends") or []
        if not (len(dates) == len(prices) == len(dividends)):
            continue

        rows = []
        for period, price, dividend in zip(dates, prices, dividends):
            try:
                price_value = float(price or 0)
                dividend_value = float(dividend or 0)
            except (TypeError, ValueError):
                continue

            if period and price_value > 0:
                rows.append((str(period), price_value, dividend_value))

        rows.sort(key=lambda row: row[0])
        if len(rows) > 1:
            periods = [row[0] for row in rows]
            prices = [row[1] for row in rows]
            dividend_prefix = [0.0]
            for _, _, dividend in rows:
                dividend_prefix.append(dividend_prefix[-1] + dividend)
            quickfs[ticker.upper()] = (periods, prices, dividend_prefix)

    conn.close()
    return quickfs


def calculate_stock_return(series, start_period, end_period):
    periods, prices, dividend_prefix = series
    start = bisect_right(periods, start_period) - 1
    end = bisect_right(periods, end_period) - 1

    if start < 0 or end < 0 or end <= start:
        return None

    start_price = prices[start]
    end_price = prices[end]
    dividends = dividend_prefix[end + 1] - dividend_prefix[start + 1]
    return ((end_price + dividends) / start_price - 1) * 100


def ensure_tables(conn):
    conn.execute("DROP TABLE IF EXISTS quickfs_equal_weight_benchmarks")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS quickfs_equal_weight_benchmarks (
            start_period TEXT NOT NULL,
            end_period TEXT NOT NULL,
            benchmark_total_return_pct REAL NOT NULL,
            benchmark_annualized_return_pct REAL NOT NULL,
            constituents INTEGER NOT NULL,
            periods_held INTEGER NOT NULL,
            calculation_note TEXT NOT NULL,
            computed_at TEXT NOT NULL,
            PRIMARY KEY (start_period, end_period, periods_held)
        )
        """
    )

    total_return_columns = {
        row[1] for row in conn.execute("PRAGMA table_info(idea_total_returns)").fetchall()
    }
    additions = {
        "benchmark_total_return_pct": "REAL",
        "benchmark_annualized_return_pct": "REAL",
        "excess_total_return_pct": "REAL",
        "excess_annualized_return_pct": "REAL",
        "benchmark_constituents": "INTEGER",
    }
    for column, column_type in additions.items():
        if column not in total_return_columns:
            conn.execute(f"ALTER TABLE idea_total_returns ADD COLUMN {column} {column_type}")

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_idea_total_returns_excess_annual "
        "ON idea_total_returns(excess_annualized_return_pct)"
    )


def main():
    args = parse_args()
    quickfs = load_quickfs_series(args.quickfs_db)
    conn = sqlite3.connect(args.vic_db)
    ensure_tables(conn)
    conn.execute("DELETE FROM quickfs_equal_weight_benchmarks")

    windows = conn.execute(
        """
        SELECT DISTINCT start_period, end_period, periods_held
        FROM idea_total_returns
        WHERE start_period IS NOT NULL
          AND end_period IS NOT NULL
          AND periods_held > 0
        """
    ).fetchall()

    computed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    note = (
        "Equal-weight benchmark from all local QuickFS stocks with usable price "
        "and dividend data over the same start/end period."
    )
    benchmark_rows = []
    benchmarks = {}

    for start_period, end_period, periods_held in windows:
        returns = []
        for series in quickfs.values():
            stock_return = calculate_stock_return(series, start_period, end_period)
            if stock_return is not None:
                returns.append(stock_return)

        if not returns:
            continue

        total_return = sum(returns) / len(returns)
        annualized_return = total_return / (periods_held / 4)
        benchmark = (
            start_period,
            end_period,
            total_return,
            annualized_return,
            len(returns),
            periods_held,
            note,
            computed_at,
        )
        benchmark_rows.append(benchmark)
        benchmarks[(start_period, end_period)] = benchmark

    conn.executemany(
        """
        INSERT INTO quickfs_equal_weight_benchmarks (
            start_period, end_period, benchmark_total_return_pct,
            benchmark_annualized_return_pct, constituents, periods_held,
            calculation_note, computed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        benchmark_rows,
    )

    updates = []
    for (
        idea_id,
        start_period,
        end_period,
        idea_total_return,
        idea_annual_return,
    ) in conn.execute(
        """
        SELECT idea_id, start_period, end_period, idea_total_return_pct,
               annualized_idea_return_pct
        FROM idea_total_returns
        """
    ):
        benchmark = benchmarks.get((start_period, end_period))
        if not benchmark:
            continue

        benchmark_total = benchmark[2]
        benchmark_annual = benchmark[3]
        constituents = benchmark[4]
        updates.append(
            (
                benchmark_total,
                benchmark_annual,
                idea_total_return - benchmark_total,
                idea_annual_return - benchmark_annual,
                constituents,
                idea_id,
            )
        )

    conn.executemany(
        """
        UPDATE idea_total_returns
        SET benchmark_total_return_pct = ?,
            benchmark_annualized_return_pct = ?,
            excess_total_return_pct = ?,
            excess_annualized_return_pct = ?,
            benchmark_constituents = ?
        WHERE idea_id = ?
        """,
        updates,
    )
    conn.commit()
    conn.close()

    print(f"quickfs_tickers={len(quickfs)}")
    print(f"benchmark_windows={len(windows)}")
    print(f"benchmarks_computed={len(benchmark_rows)}")
    print(f"ideas_updated={len(updates)}")


if __name__ == "__main__":
    main()
