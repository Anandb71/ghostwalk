// Regenerates the generated blocks of README.md, so no number in it is typed by hand:
//   <!-- sync:results -->  eval/results.md as is, headings nested one level under the README's "Results"
//   <!-- sync:layout -->   declared warehouse layout, from the engine's web/src/sim/layout.ts
//   <!-- sync:data -->     dataset counts, from web/public/data/orders.json (meta written by data/prepare.py)
//   <!-- sync:stack -->    dependency table, from web/package.json
//
// Run from web/:
//   npx tsx ../scripts/sync-readme.ts          rewrite README.md in place
//   npx tsx ../scripts/sync-readme.ts --check  exit 1 if README.md is out of date
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AISLES,
  AISLE_PITCH,
  BAYS,
  BAY_PITCH,
  CROSS_AISLE,
  DOCK,
  EDGES,
  NODE_COUNT,
  PICK_SECONDS,
  RACK_DEPTH,
  RACK_HEIGHT,
  SIDES,
  SLOTS,
  WALKWAY,
  WALK_SPEED,
  dist,
  frontNode,
} from '../web/src/sim/layout'
import type { DatasetMeta } from '../web/src/sim/types'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = (p: string) => join(root, p)
const int = (n: number) => n.toLocaleString('en-US')
const m = (v: number) => `${v.toFixed(1)} m`

const PURPOSE: Record<string, string> = {
  react: 'UI',
  'react-dom': 'UI',
  three: '3D engine',
  '@react-three/fiber': 'React renderer for three.js',
  '@react-three/drei': 'camera controls, lines, labels',
  '@react-three/postprocessing': 'optional bloom (High quality only)',
  zustand: 'app state',
  motion: 'counter / panel animation',
  vite: 'dev server and bundler',
  '@vitejs/plugin-react': 'React fast refresh',
  tailwindcss: 'styling',
  '@tailwindcss/vite': 'Tailwind Vite plugin',
  typescript: 'strict types',
  vitest: 'unit tests',
  tsx: 'runs eval/run.ts and these scripts in Node with the same engine',
  '@types/node': 'types',
  '@types/react': 'types',
  '@types/react-dom': 'types',
  '@types/three': 'types',
}

const table = (rows: [string, string][]) => ['| | |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join('\n')

function resultsBlock(): string {
  const file = path('eval/results.md')
  if (!existsSync(file)) {
    return [
      '> **Pending:** `eval/results.md` does not exist yet. Run `npm run eval` in `web/`, then',
      '> `npx tsx ../scripts/sync-readme.ts`. No result number in this README is typed by hand.',
    ].join('\n')
  }
  const body = readFileSync(file, 'utf8')
    .replace(/\r\n/g, '\n')
    .trim()
    .replace(/^(#{1,4}) /gm, (_, h: string) => `${h}## `) // "# x" -> "### x"
  return `_Copied from [\`eval/results.md\`](eval/results.md) by \`scripts/sync-readme.ts\`; only heading levels are changed._\n\n${body}`
}

function layoutBlock(): string {
  return table([
    ['Pick zone', `${AISLES} aisles × ${SIDES} rack sides × ${BAYS} bays = **${SLOTS} slots**, one SKU per slot`],
    ['Cross-aisles', `3 (front, middle, back), ${m(CROSS_AISLE)} wide; the middle one splits each aisle into two blocks of ${BAYS / 2} bays`],
    ['Dimensions', `aisle pitch ${m(AISLE_PITCH)} · walkway ${m(WALKWAY)} · rack depth ${m(RACK_DEPTH)} · bay pitch ${m(BAY_PITCH)} · rack height ${m(RACK_HEIGHT)}`],
    ['Dock (packing station)', `on the front cross-aisle, ${m(dist(DOCK, frontNode(0)))} before aisle 0; every tour starts and ends here`],
    ['Walking', `${WALK_SPEED} m/s, only along the ${NODE_COUNT}-node, ${EDGES.length}-edge aisle graph (never through racks); both rack sides of a bay share one node`],
    ['Picking', `${PICK_SECONDS} s per order line`],
    ['Time model', `seconds = metres / ${WALK_SPEED} + ${PICK_SECONDS} × lines (synthetic, not observed)`],
    ['Slot id', '`aisle × 20 + side × 10 + bay` (side 0 = left / −x, side 1 = right / +x)'],
  ])
}

function dataBlock(): string {
  const { meta } = JSON.parse(readFileSync(path('web/public/data/orders.json'), 'utf8')) as { meta: DatasetMeta }
  const s = meta.stats as Record<string, number>
  const hist = Object.entries(meta.linesPerOrderHistogram)
    .map(([k, v]) => [Number(k), v] as const)
    .sort((a, b) => a[0] - b[0])
  const total = hist.reduce((t, [, v]) => t + v, 0)
  let seen = 0
  let median = 0
  for (const [k, v] of hist) {
    seen += v
    if (seen * 2 >= total) {
      median = k
      break
    }
  }
  return table([
    ['Source', `${meta.source} · ${meta.doi} · ${meta.licence}`],
    ['Raw rows in the sheet (Dec 2010 – Dec 2011)', int(s.raw_rows)],
    ['Dropped: cancelled invoices (`C…`)', int(s.dropped_cancellations)],
    ['Dropped: quantity ≤ 0', int(s.dropped_nonpositive_qty)],
    ['Dropped: price ≤ 0', int(s.dropped_nonpositive_price)],
    ['Dropped: non-product codes', int(s.dropped_non_product_codes)],
    [`Order lines in ${meta.month}, all SKUs`, `${int(s.month_lines_all_skus)} lines · ${int(s.month_orders_all_skus)} orders · ${int(s.month_distinct_skus)} SKUs`],
    ['SKUs slotted in the pick zone (top by order lines)', int(meta.topSkus)],
    ['Share of the month’s lines those SKUs cover', `${(s.coverage_of_month_lines_by_top_skus * 100).toFixed(1)} %`],
    ['Orders replayed (≥ 1 line in the pick zone)', int(meta.orderCount)],
    ['Order lines replayed', int(meta.lineCount)],
    ['Lines per order (mean · median · max)', `${(meta.lineCount / meta.orderCount).toFixed(2)} · ${median} · ${hist[hist.length - 1][0]}`],
    ['Train orders (player, heatmap and optimiser see these)', int(meta.split.train)],
    ['Held-out orders (scoring only)', int(meta.split.holdout)],
    ['Split rule', meta.split.rule],
  ])
}

function stackBlock(): string {
  const pkg = JSON.parse(readFileSync(path('web/package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const rows = (deps: Record<string, string> = {}) =>
    Object.entries(deps)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, v]) => `| \`${name}\` | ${v} | ${PURPOSE[name] ?? '—'} |`)
  return ['| Package | Version | Used for |', '|---|---|---|', ...rows(pkg.dependencies), '| **dev** | | |', ...rows(pkg.devDependencies)].join(
    '\n',
  )
}

const BLOCKS: Record<string, () => string> = { results: resultsBlock, layout: layoutBlock, data: dataBlock, stack: stackBlock }

const readmePath = path('README.md')
const original = readFileSync(readmePath, 'utf8')
const eol = original.includes('\r\n') ? '\r\n' : '\n'
let text = original.replace(/\r\n/g, '\n')

for (const [name, build] of Object.entries(BLOCKS)) {
  const re = new RegExp(`(<!-- sync:${name} -->)[\\s\\S]*?(<!-- /sync:${name} -->)`)
  if (!re.test(text)) {
    console.error(`README.md is missing the <!-- sync:${name} --> … <!-- /sync:${name} --> markers`)
    process.exit(2)
  }
  const content = build()
  // function replacer: `$` in the content must stay literal
  text = text.replace(re, (_, open: string, close: string) => `${open}\n${content}\n${close}`)
}

const updated = text.replace(/\n/g, eol)
if (process.argv.includes('--check')) {
  if (updated !== original) {
    console.error('README.md is out of date: run npx tsx ../scripts/sync-readme.ts from web/')
    process.exit(1)
  }
  console.log('README.md is up to date')
} else if (updated !== original) {
  writeFileSync(readmePath, updated)
  console.log('README.md updated')
} else {
  console.log('README.md already up to date')
}
