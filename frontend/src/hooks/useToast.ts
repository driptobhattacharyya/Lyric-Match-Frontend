import { useCallback, useEffect, useState } from 'react'

/** One inline toast at a time; it clears itself after `ms`. */
export function useToast(ms = 2600) {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), ms)
    return () => window.clearTimeout(id)
  }, [toast, ms])

  const show = useCallback((text: string) => setToast((t) => ({ id: (t?.id ?? 0) + 1, text })), [])
  return { toast: toast?.text ?? null, toastKey: toast?.id ?? 0, show }
}
