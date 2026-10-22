import type { Dataset, Order, PreparedData, SetName } from './types'

// TODO(engine #1): implement. Map sku strings to product indices, keep chronological order.
export function prepareDataset(raw: Dataset): PreparedData {
  void raw
  throw new Error('not implemented')
}

export function ordersFor(data: PreparedData, set: SetName): Order[] {
  void data
  void set
  throw new Error('not implemented')
}
