/** The part of a syntax node this needs: its directives and its parent. */
export interface DirectiveHolder {
  readonly parent?: DirectiveHolder
  readonly directives?: readonly {
    readonly target: { readonly sv: string }
    readonly arguments: readonly object[]
  }[]
}

/**
 * Whether a `#suppress "<code>" "reason"` directive sits on the node or on one of its parents.
 * The compiler applies these to warnings only; this is what lets them apply to findings a
 * config has raised to errors.
 */
export function isSuppressed(node: DirectiveHolder | undefined, code: string): boolean {
  for (let current = node; current; current = current.parent) {
    for (const directive of current.directives ?? []) {
      if (directive.target.sv !== 'suppress') continue
      const [first] = directive.arguments
      if (first && 'value' in first && first.value === code) return true
    }
  }
  return false
}
