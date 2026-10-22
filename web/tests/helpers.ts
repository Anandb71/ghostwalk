import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { prepareDataset, type Dataset, type PreparedData } from '../src/sim'

let cached: { raw: Dataset; data: PreparedData } | null = null

/** The real dataset (web/public/data/orders.json), loaded once per test file. */
export function loadData(): { raw: Dataset; data: PreparedData } {
  if (!cached) {
    const path = fileURLToPath(new URL('../public/data/orders.json', import.meta.url))
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Dataset
    cached = { raw, data: prepareDataset(raw) }
  }
  return cached
}
