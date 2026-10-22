# Ghostwalk — race your old warehouse

NexAI Hack 2026 · Problem 4.2 · Warehouse Digital Twin: 3D Picking Floor Game

A browser-native 3D digital twin of a picking floor driven by one real month of UCI Online Retail II orders.
Re-slot the cartons, replay the same orders, and race a ghost picker on your old layout against the new one.
Beat the fast-movers baseline, then beat the simulated-annealing optimiser. Every number is measured on a
held-out half of the month by one deterministic simulator.

> Work in progress — see [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md) and [docs/BUILD_SPEC.md](docs/BUILD_SPEC.md).

## Data
UCI Online Retail II (Chen, 2019) — https://doi.org/10.24432/C5CG6D — CC BY 4.0.
`python data/prepare.py <online_retail_II.xlsx> web/public/data/orders.json --month 2011-11 --top 100`

## Team
Anand (Anandb71) · Junaid Ahamed (junaidahamed-7777)
