import { useEffect, useRef } from 'react'

/**
 * Write a string into an element every animation frame without React re-renders.
 * Used for the mutable `liveCounters` the scene updates in useFrame.
 */
export function useLiveText<T extends HTMLElement>(read: () => string) {
  const ref = useRef<T>(null)
  const readRef = useRef(read)
  readRef.current = read
  useEffect(() => {
    let raf = 0
    let last = ''
    const tick = () => {
      const el = ref.current
      if (el) {
        let next = last
        try {
          next = readRef.current()
        } catch {
          /* keep last value */
        }
        if (next !== last) {
          el.textContent = next
          last = next
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return ref
}

/** Run a callback every animation frame (for things like progress bars driven by liveCounters). */
export function useRafLoop(cb: () => void) {
  const cbRef = useRef(cb)
  cbRef.current = cb
  useEffect(() => {
    let raf = 0
    const tick = () => {
      try {
        cbRef.current()
      } catch {
        /* ignore */
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
}
