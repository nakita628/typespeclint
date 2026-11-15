import type { Type } from '@typespec/compiler'

import type { TypeConvention } from '../types/index.js'
import { toRegExp } from '../utils/naming.js'
import { typeNames } from '../utils/typespec.js'

/**
 * Returns the violated convention, if any. `format` is the `@format` declared on the property
 * or parameter; it answers to the type name `@format:<format>`.
 */
export function violatedConvention(
  name: string,
  type: Type,
  conventions: TypeConvention[],
  format?: string,
): TypeConvention | undefined {
  const declared = typeNames(type)
  if (!declared) return undefined
  const names = format ? [...declared, `@format:${format}`] : declared
  for (const convention of conventions) {
    if (!toRegExp(convention.pattern).test(name)) continue
    if (!names.some((n) => convention.types.includes(n))) return convention
  }
  return undefined
}
