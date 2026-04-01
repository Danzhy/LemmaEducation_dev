/**
 * useCanvasChangeDetection Hook
 *
 * Listens for tldraw canvas changes (shapes added/updated/removed) and calls
 * onChange after a debounce. Used to trigger canvas capture for Realtime API streaming.
 */

'use client'

import { useEffect, useRef, useCallback } from 'react'
// @ts-expect-error - Editor is exported at runtime but TypeScript definitions may be incomplete
import type { Editor } from 'tldraw'

type UseCanvasChangeDetectionOptions = {
  debounceMs?: number
  enabled?: boolean
}

/**
 * Subscribes to editor store changes and calls onChange after debounce.
 *
 * @param editor - tldraw Editor instance (from onEditorReady)
 * @param onChange - Called when canvas changes (debounced)
 * @param options.debounceMs - Debounce delay in ms (default 2500)
 * @param options.enabled - Whether to run the listener (default true)
 */
export function useCanvasChangeDetection(
  editor: Editor | null,
  onChange: () => void,
  options: UseCanvasChangeDetectionOptions = {}
) {
  const { debounceMs = 2500, enabled = true } = options
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const scheduleOnChange = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      onChangeRef.current()
    }, debounceMs)
  }, [debounceMs])

  useEffect(() => {
    if (!editor || !enabled) return

    const cleanup = editor.store.listen(
      (entry: { changes: { added: Record<string, unknown>; updated: Record<string, unknown>; removed: Record<string, unknown> } }) => {
        const { added, updated, removed } = entry.changes
        const numAdded = Object.keys(added).length
        const numUpdated = Object.keys(updated).length
        const numRemoved = Object.keys(removed).length
        const hasShapeChanges = numAdded > 0 || numUpdated > 0 || numRemoved > 0
        if (!hasShapeChanges) return
        // Skip insignificant changes: single position tweak (1 updated, 0 add/remove)
        if (numAdded === 0 && numRemoved === 0 && numUpdated === 1) return
        scheduleOnChange()
      },
      { source: 'user', scope: 'document' }
    )

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      cleanup()
    }
  }, [editor, enabled, scheduleOnChange])
}
