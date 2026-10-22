"""
prepare.py - turn one month of UCI Online Retail II order lines into the JSON the
warehouse twin replays.

Usage:
    python data/prepare.py <path/to/online_retail_II.xlsx> <out.json> [--month 2011-11] [--top 100]

Data rules (also documented in README):
  * Sheet "Year 2010-2011" only (Dec 2010 - Dec 2011).
  * Cancellations removed: Invoice numbers starting with "C".
  * Non-product codes removed: only StockCodes matching ^\d{5}[A-Z]{0,2}$ are kept
    (drops POST, D, M, BANK CHARGES, DOT, S, AMAZONFEE, CRUK, ADJUST, gift_* ...).
  * Quantity <= 0 or Price <= 0 lines removed (returns / manual adjustments).
  * Lines are aggregated per (Invoice, StockCode): one pick per product per order.
  * The top-N SKUs by number of order lines (pick frequency) in the month are kept;
    orders are restricted to those SKUs and orders left with zero lines are dropped.
  * Chronological split: orders dated 1-15 of the month are "train" (the player and
    the optimiser see them); orders dated 16-end are "holdout" (used for scoring only).

Source: Chen, D. (2019). Online Retail II [Dataset]. UCI Machine Learning Repository.
        https://doi.org/10.24432/C5CG6D  - licence CC BY 4.0.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import pandas as pd

PRODUCT_CODE = re.compile(r"^\d{5}[A-Z]{0,2}$")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("out")
    ap.add_argument("--month", default="2011-11", help="YYYY-MM")
    ap.add_argument("--top", type=int, default=100)
    ap.add_argument("--split-day", type=int, default=16, help="first day of the holdout half")
    args = ap.parse_args()

    xlsx = Path(args.xlsx)
    print(f"reading {xlsx} ...", flush=True)
    xl = pd.ExcelFile(xlsx)
    sheet = "Year 2010-2011" if "Year 2010-2011" in xl.sheet_names else xl.sheet_names[-1]
    df = xl.parse(sheet, dtype={"Invoice": str, "StockCode": str})
    print(f"sheet {sheet!r}: {len(df):,} raw rows", flush=True)

    raw_rows = len(df)
    df["Invoice"] = df["Invoice"].astype(str).str.strip()
    df["StockCode"] = df["StockCode"].astype(str).str.strip().str.upper()
    df["InvoiceDate"] = pd.to_datetime(df["InvoiceDate"])

    stats = {"raw_rows": raw_rows}
    m = df["Invoice"].str.startswith("C")
    stats["dropped_cancellations"] = int(m.sum())
    df = df[~m]

    m = df["Quantity"] <= 0
    stats["dropped_nonpositive_qty"] = int(m.sum())
    df = df[~m]

    m = df["Price"] <= 0
    stats["dropped_nonpositive_price"] = int(m.sum())
    df = df[~m]

    m = ~df["StockCode"].str.match(PRODUCT_CODE)
    stats["dropped_non_product_codes"] = int(m.sum())
    stats["example_non_product_codes"] = sorted(df.loc[m, "StockCode"].unique().tolist())[:25]
    df = df[~m]

    year, month = (int(x) for x in args.month.split("-"))
    start = pd.Timestamp(year=year, month=month, day=1)
    end = start + pd.offsets.MonthBegin(1)
    month_df = df[(df["InvoiceDate"] >= start) & (df["InvoiceDate"] < end)]
    stats["month"] = args.month
    stats["month_rows_after_cleaning"] = int(len(month_df))

    lines = (
        month_df.groupby(["Invoice", "StockCode"], as_index=False)
        .agg(qty=("Quantity", "sum"), ts=("InvoiceDate", "min"), desc=("Description", "first"))
    )
    stats["month_lines_all_skus"] = int(len(lines))
    stats["month_orders_all_skus"] = int(lines["Invoice"].nunique())
    stats["month_distinct_skus"] = int(lines["StockCode"].nunique())

    freq = lines.groupby("StockCode").size().sort_values(ascending=False)
    top = freq.head(args.top).index.tolist()
    top_set = set(top)
    lines_top = lines[lines["StockCode"].isin(top_set)].copy()
    stats["coverage_of_month_lines_by_top_skus"] = round(len(lines_top) / len(lines), 4)

    split_ts = pd.Timestamp(year=year, month=month, day=args.split_day)

    orders = []
    for inv, g in lines_top.groupby("Invoice"):
        g = g.sort_values("StockCode")
        ts = g["ts"].min()
        orders.append(
            {
                "id": str(inv),
                "ts": ts.strftime("%Y-%m-%dT%H:%M:%S"),
                "split": "train" if ts < split_ts else "holdout",
                "lines": [{"sku": r.StockCode, "qty": int(r.qty)} for r in g.itertuples()],
            }
        )
    orders.sort(key=lambda o: (o["ts"], o["id"]))

    picks_train = lines_top[lines_top["ts"] < split_ts].groupby("StockCode").size()
    picks_holdout = lines_top[lines_top["ts"] >= split_ts].groupby("StockCode").size()
    qty_total = lines_top.groupby("StockCode")["qty"].sum()
    desc = lines_top.groupby("StockCode")["desc"].agg(lambda s: s.dropna().astype(str).str.strip().iloc[0] if s.dropna().size else "")

    products = []
    for rank, sku in enumerate(top, start=1):
        products.append(
            {
                "sku": sku,
                "desc": desc.get(sku, ""),
                "rank": rank,
                "picks": int(freq[sku]),
                "picksTrain": int(picks_train.get(sku, 0)),
                "picksHoldout": int(picks_holdout.get(sku, 0)),
                "qty": int(qty_total.get(sku, 0)),
            }
        )

    n_train = sum(o["split"] == "train" for o in orders)
    n_hold = len(orders) - n_train
    line_hist = {}
    for o in orders:
        k = len(o["lines"])
        line_hist[k] = line_hist.get(k, 0) + 1

    out = {
        "meta": {
            "source": "UCI Online Retail II (Chen, 2019), sheet 'Year 2010-2011'",
            "doi": "https://doi.org/10.24432/C5CG6D",
            "licence": "CC BY 4.0",
            "month": args.month,
            "topSkus": args.top,
            "split": {
                "rule": f"orders dated before {split_ts.date()} are train; on/after are holdout",
                "train": n_train,
                "holdout": n_hold,
            },
            "cleaning": [
                "removed invoices starting with 'C' (cancellations)",
                "removed Quantity <= 0 and Price <= 0 lines (returns, adjustments)",
                "kept only StockCodes matching ^\\d{5}[A-Z]{0,2}$ (drops POST, D, M, BANK CHARGES, DOT, S, AMAZONFEE, CRUK, ADJUST, gift codes)",
                "one pick per (invoice, product): quantities summed within an invoice",
                f"kept the top {args.top} SKUs by number of order lines in the month; orders restricted to them",
            ],
            "stats": stats,
            "orderCount": len(orders),
            "lineCount": int(sum(len(o["lines"]) for o in orders)),
            "linesPerOrderHistogram": {str(k): v for k, v in sorted(line_hist.items())},
        },
        "products": products,
        "orders": orders,
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({k: v for k, v in out["meta"].items() if k != "cleaning"}, indent=1))
    print(f"wrote {out_path} ({out_path.stat().st_size/1024:.0f} KB): {len(products)} products, {len(orders)} orders, {out['meta']['lineCount']} lines")


if __name__ == "__main__":
    sys.exit(main())
