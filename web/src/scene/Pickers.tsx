// Chooses which pickers are on the floor:
//  - race (mode === 'race' && race.active): ghost walks race.ghostPlans, solid walks race.solidPlans,
//    back to back, same speed (replay.speed), paused/resumed with replay.playing (the store sets it
//    on startRace and clears it when both finish); each writes liveCounters.ghost / liveCounters.solid.
//  - otherwise (replay / idle): one solid picker walks replay.plan when replay.playing and writes
//    liveCounters.replay; with no plan it stands at the dock.
import { useMemo } from 'react'
import type { OrderScore } from '../sim/types'
import { liveCounters, useStore } from '../store'
import Walker from './Walker'
import { DEV_PLAN, DEV_WALK } from './shared'

const EMPTY: readonly OrderScore[] = []
const always = () => true
const replayPlaying = () => useStore.getState().replay.playing
const replaySpeed = () => useStore.getState().replay.speed
const onReplayFinished = () => useStore.getState().replayFinished()
const onGhostFinished = () => useStore.getState().raceFinished('ghost')
const onSolidFinished = () => useStore.getState().raceFinished('solid')

function ReplayWalker() {
  const plan = useStore((s) => s.replay.plan)
  const runId = useStore((s) => s.replay.runId)
  const dev = !plan && DEV_WALK
  const plans = useMemo<readonly OrderScore[]>(() => (plan ? [plan] : dev ? [DEV_PLAN] : EMPTY), [plan, dev])
  return (
    <Walker
      variant="solid"
      plans={plans}
      runKey={runId}
      counters={liveCounters.replay}
      isPlaying={dev ? always : replayPlaying}
      getSpeed={replaySpeed}
      onFinished={dev ? undefined : onReplayFinished}
      restartOnPlay
      follow
    />
  )
}

function RaceWalkers() {
  const ghostPlans = useStore((s) => s.race.ghostPlans)
  const solidPlans = useStore((s) => s.race.solidPlans)
  const runId = useStore((s) => s.race.runId)
  const ghostLabel = useStore((s) => s.race.ghostLabel)
  const solidLabel = useStore((s) => s.race.solidLabel)
  return (
    <>
      <Walker
        variant="ghost"
        plans={ghostPlans}
        runKey={runId}
        counters={liveCounters.ghost}
        isPlaying={replayPlaying}
        getSpeed={replaySpeed}
        onFinished={onGhostFinished}
        label={ghostLabel}
        labelY={2.75}
        lineY={0.09}
      />
      <Walker
        variant="solid"
        plans={solidPlans}
        runKey={runId}
        counters={liveCounters.solid}
        isPlaying={replayPlaying}
        getSpeed={replaySpeed}
        onFinished={onSolidFinished}
        follow
        label={solidLabel}
        labelY={2.25}
        lineY={0.06}
      />
    </>
  )
}

export default function Pickers() {
  const raceOn = useStore((s) => s.mode === 'race' && s.race.active)
  return raceOn ? <RaceWalkers /> : <ReplayWalker />
}
