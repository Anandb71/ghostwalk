import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Scene from './scene/Scene'
import { useStore, type Mode } from './store'
import { useKeyboard } from './hooks/useKeyboard'
import TopBar from './ui/TopBar'
import KpiCard from './ui/KpiCard'
import Hud from './ui/Hud'
import OrderPanel from './ui/OrderPanel'
import SlotPanel from './ui/SlotPanel'
import RacePanel from './ui/RacePanel'
import AnnealPanel from './ui/AnnealPanel'
import EvidencePanel from './ui/EvidencePanel'
import StatusOverlay from './ui/StatusOverlay'
import { cx } from './ui/primitives'

function LeftPanel({ mode }: { mode: Mode }) {
  switch (mode) {
    case 'replay':
      return <OrderPanel />
    case 'slot':
      return <SlotPanel />
    case 'race':
      return <RacePanel />
    case 'anneal':
      return <AnnealPanel />
    case 'evidence':
      return <EvidencePanel />
  }
}

export default function App() {
  const load = useStore((s) => s.load)
  const mode = useStore((s) => s.mode)
  const ready = useStore((s) => s.status === 'ready')
  useKeyboard()

  useEffect(() => {
    void load() // idempotent: safe under StrictMode double effects
  }, [load])

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink">
      {/* full-bleed 3D scene; the overlay below only takes pointer events on its panels */}
      <div className="absolute inset-0">
        <Scene />
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3">
        <TopBar />

        <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
          <aside
            className={cx(
              'pointer-events-none flex max-h-full min-h-0 flex-col',
              mode === 'evidence' ? 'w-[420px]' : 'w-[360px]',
            )}
          >
            {ready && (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="panel-scroll pointer-events-auto min-h-0 overflow-y-auto rounded-xl"
                >
                  <LeftPanel mode={mode} />
                </motion.div>
              </AnimatePresence>
            )}
          </aside>

          <aside className="panel-scroll pointer-events-auto flex max-h-full min-h-0 w-[380px] flex-col gap-3 overflow-y-auto rounded-xl">
            <KpiCard />
            {/* LEADERBOARD MOUNT POINT (issue #8, Junaid): render <Leaderboard /> from './ui/Leaderboard' here. */}
          </aside>
        </div>

        <div className="pointer-events-none flex justify-center">
          <div className="pointer-events-auto w-full max-w-[880px]">
            <Hud />
          </div>
        </div>
      </div>

      <StatusOverlay />
    </div>
  )
}
