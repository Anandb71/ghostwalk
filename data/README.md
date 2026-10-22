# Data

**Source:** Chen, D. (2019). Online Retail II [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D
**Licence:** CC BY 4.0
**Download (44 MB):** https://archive.ics.uci.edu/static/public/502/online+retail+ii.zip (contains `online_retail_II.xlsx`).
Mirror (parquet, 7 MB): https://huggingface.co/datasets/vancevo/online-retail-ii/resolve/main/data/train-00000-of-00001.parquet

```bash
python data/prepare.py path/to/online_retail_II.xlsx web/public/data/orders.json --month 2011-11 --top 100
```

## Data rules
- Sheet `Year 2010-2011` only.
- Cancellations removed: invoice numbers starting with `C`.
- Returns / adjustments removed: `Quantity <= 0` or `Price <= 0`.
- Non-product codes removed: only StockCodes matching `^\d{5}[A-Z]{0,2}$` are kept (drops POST, D, M, BANK CHARGES, DOT, S, AMAZONFEE, CRUK, ADJUST, gift codes).
- One pick per (invoice, product): quantities summed within an invoice.
- The 100 most-picked SKUs of November 2011 (by number of order lines) define the forward-pick zone; orders are restricted to those SKUs.
- Chronological split: orders dated 1–15 Nov 2011 = `train`, 16–30 Nov 2011 = `holdout`.

Output: `web/public/data/orders.json` — 100 products, 2,362 orders, 17,056 lines (meta block documents every count).
