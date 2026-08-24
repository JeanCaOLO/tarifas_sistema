import { useEffect, useRef, useCallback } from 'react'

const DRAFT_PREFIX = 'rfp_draft_'

export function useAutoSave(paisCode, getData) {
  const timerRef = useRef(null)

  const save = useCallback(() => {
    if (!paisCode) return
    const data = getData()
    if (!data) return
    try {
      localStorage.setItem(DRAFT_PREFIX + paisCode, JSON.stringify({ ...data, timestamp: Date.now() }))
    } catch (_) {}
  }, [paisCode, getData])

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(save, 1500)
  }, [save])

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return { scheduleSave, save }
}

export function loadDraft(paisCode) {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + paisCode)
    return raw ? JSON.parse(raw) : null
  } catch (_) { return null }
}

export function clearDraft(paisCode) {
  try { localStorage.removeItem(DRAFT_PREFIX + paisCode) } catch (_) {}
}
