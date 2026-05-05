'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

export type TutorialStep = {
  id: string
  title: string
  description: string
  targetId?: string
  targetSelector?: string | string[]
  placement?: 'top' | 'right' | 'bottom' | 'left'
}

interface GuidedTutorialOverlayProps {
  open: boolean
  steps: TutorialStep[]
  currentStepIndex: number
  onStepChange: (nextStep: number) => void
  onClose: () => void
}

type Rect = { top: number; left: number; width: number; height: number }

const PADDING = 8
const TOOLTIP_WIDTH = 320

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const toRect = (element: HTMLElement): Rect => {
  const rect = element.getBoundingClientRect()
  return {
    top: Math.max(0, rect.top - PADDING),
    left: Math.max(0, rect.left - PADDING),
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  }
}

const resolveTarget = (step: TutorialStep): HTMLElement | null => {
  if (step.targetSelector) {
    const selectors = Array.isArray(step.targetSelector)
      ? step.targetSelector
      : [step.targetSelector]

    for (const selector of selectors) {
      const el = document.querySelector<HTMLElement>(selector)
      if (el) return el
    }
  }

  if (step.targetId) {
    const byId = document.querySelector<HTMLElement>(`[data-tutorial-id="${step.targetId}"]`)
    if (byId) return byId
  }

  return null
}

const getTooltipPosition = (
  targetRect: Rect | null,
  placement: TutorialStep['placement'] = 'bottom'
) => {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const spacing = 14
  const fallbackTop = viewportHeight / 2 - 120
  const fallbackLeft = viewportWidth / 2 - TOOLTIP_WIDTH / 2

  if (!targetRect) {
    return {
      top: clamp(fallbackTop, 16, viewportHeight - 260),
      left: clamp(fallbackLeft, 16, viewportWidth - TOOLTIP_WIDTH - 16),
    }
  }

  const centerX = targetRect.left + targetRect.width / 2
  const centerY = targetRect.top + targetRect.height / 2
  const maxLeft = Math.max(16, viewportWidth - TOOLTIP_WIDTH - 16)

  if (placement === 'top') {
    return {
      top: clamp(targetRect.top - 170 - spacing, 16, viewportHeight - 260),
      left: clamp(centerX - TOOLTIP_WIDTH / 2, 16, maxLeft),
    }
  }

  if (placement === 'left') {
    return {
      top: clamp(centerY - 80, 16, viewportHeight - 260),
      left: clamp(targetRect.left - TOOLTIP_WIDTH - spacing, 16, maxLeft),
    }
  }

  if (placement === 'right') {
    return {
      top: clamp(centerY - 80, 16, viewportHeight - 260),
      left: clamp(targetRect.left + targetRect.width + spacing, 16, maxLeft),
    }
  }

  return {
    top: clamp(targetRect.top + targetRect.height + spacing, 16, viewportHeight - 260),
    left: clamp(centerX - TOOLTIP_WIDTH / 2, 16, maxLeft),
  }
}

export default function GuidedTutorialOverlay({
  open,
  steps,
  currentStepIndex,
  onStepChange,
  onClose,
}: GuidedTutorialOverlayProps) {
  const [mounted, setMounted] = useState(false)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)

  const currentStep = steps[currentStepIndex]

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open || !currentStep) return

    const updateRect = () => {
      const target = resolveTarget(currentStep)
      if (!target) {
        setTargetRect(null)
        return
      }
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      setTargetRect(toRect(target))
    }

    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [open, currentStep])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
      if (event.key === 'ArrowRight' && currentStepIndex < steps.length - 1) {
        onStepChange(currentStepIndex + 1)
      }
      if (event.key === 'ArrowLeft' && currentStepIndex > 0) {
        onStepChange(currentStepIndex - 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, currentStepIndex, steps.length, onStepChange, onClose])

  const tooltipPosition = useMemo(() => {
    if (!open || !currentStep) return null
    return getTooltipPosition(targetRect, currentStep.placement)
  }, [open, currentStep, targetRect])

  if (!mounted || !open || !currentStep || !tooltipPosition) return null

  const isFirst = currentStepIndex === 0
  const isLast = currentStepIndex === steps.length - 1

  return createPortal(
    <div className="fixed inset-0 z-[2147483647]">
      {targetRect ? (
        <>
          <div className="fixed inset-x-0 top-0 bg-black/55" style={{ height: targetRect.top }} />
          <div
            className="fixed bg-black/55"
            style={{ top: targetRect.top, left: 0, width: targetRect.left, height: targetRect.height }}
          />
          <div
            className="fixed bg-black/55"
            style={{
              top: targetRect.top,
              left: targetRect.left + targetRect.width,
              right: 0,
              height: targetRect.height,
            }}
          />
          <div
            className="fixed inset-x-0 bottom-0 bg-black/55"
            style={{ top: targetRect.top + targetRect.height }}
          />
          <div
            className="fixed rounded-lg border-2 border-[#F2F5F4] shadow-[0_0_0_1px_rgba(15,41,34,0.45)]"
            style={{
              top: targetRect.top,
              left: targetRect.left,
              width: targetRect.width,
              height: targetRect.height,
            }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/60" />
      )}

      <div
        role="dialog"
        aria-modal="true"
        className="fixed z-[2147483647] w-[320px] rounded-[24px] border border-[#D8E4DF] bg-[rgba(251,253,252,0.96)] p-5 shadow-[0_28px_80px_-48px_rgba(15,41,34,0.75)] backdrop-blur-md"
        style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
      >
        <div className="text-[11px] uppercase tracking-[0.22em] text-[#5C7069]">
          Step {currentStepIndex + 1} of {steps.length}
        </div>
        <h3 className="mt-2 text-base font-medium tracking-[-0.02em] text-[#163B35]">{currentStep.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#49615A]">{currentStep.description}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#C9D6D1] bg-white/80 px-3 py-1.5 text-xs font-medium text-[#3F524C] transition-all hover:border-[#16423C] hover:text-[#16423C]"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onStepChange(currentStepIndex - 1)}
              disabled={isFirst}
              className="rounded-full border border-[#C9D6D1] bg-white/80 px-3 py-1.5 text-xs font-medium text-[#3F524C] transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => (isLast ? onClose() : onStepChange(currentStepIndex + 1))}
              className="rounded-full bg-[#16423C] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#0A2621]"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
