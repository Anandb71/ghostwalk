import type { Assignment, Order, OrderScore, Policy, ScoreResult, SetName } from './types'

// TODO(engine #1): implement.
/** Route one order on a layout. Used by the worker (all orders) and the main thread (replay of one order). */
export function planOrder(order: Order, assignment: Assignment, policy: Policy): OrderScore {
  void order
  void assignment
  void policy
  throw new Error('not implemented')
}

/** Score a set of orders. withPaths=false leaves path/picks empty to save memory. */
export function simulate(
  orders: readonly Order[],
  assignment: Assignment,
  policy: Policy,
  set: SetName = 'all',
  withPaths = true,
): ScoreResult {
  void orders
  void assignment
  void policy
  void set
  void withPaths
  throw new Error('not implemented')
}
