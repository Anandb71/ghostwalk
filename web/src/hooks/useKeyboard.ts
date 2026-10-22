import { useEffect } from 'react'
import { useStore } from '../store'

const isTyping = (t: EventTarget | null): boolean => {
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable) return true
  const tag = t.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type
    // range sliders and buttons should not swallow the shortcuts
    return !['range', 'button', 'checkbox', 'radio', 'submit'].includes(type)
  }
  return false
}

/** Space play/pause · 1/2/3 camera presets · R race · Esc clear selection. */
export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTyping(e.target)) return
      const s = useStore.getState()
      switch (e.key) {
        case ' ':
        case 'Spacebar':
          e.preventDefault()
          s.togglePlay()
          break
        case '1':
          s.setCamera('overview')
          break
        case '2':
          s.setCamera('follow')
          break
        case '3':
          s.setCamera('top')
          break
        case 'r':
        case 'R':
          if (s.status === 'ready') s.startRace()
          break
        case 'Escape':
          s.selectSlot(null)
          break
        default:
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
