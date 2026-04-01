/**
 * Type augmentations for tldraw custom shapes
 *
 * This file extends tldraw's type system to include our custom math-block shape.
 * The math-block shape stores LaTeX source code and a display mode flag.
 */

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    'math-block': {
      latex: string // LaTeX source code (e.g., "$x^{2} + y^{2}$")
      displayMode: boolean // true for display math (centered), false for inline
    }
  }
}
