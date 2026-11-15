import { resolvePath } from '@typespec/compiler'
import { createLinterRuleTester, createTester } from '@typespec/compiler/testing'

import { toLinterRule } from '../src/helper/rule.js'
import type { RuleSpec, TypespeclintConfig } from '../src/types/index.js'

export const Tester = createTester(resolvePath(import.meta.dirname, '..'), {
  libraries: ['@typespec/http'],
})
  .importLibraries()
  .using('Http')

/** Rule tester for one rule; `options` plays the role of `typespeclint.config.ts`. */
export async function ruleTester<N extends string, O extends object>(
  spec: RuleSpec<N, O>,
  options?: Partial<O> | false,
) {
  const config = {
    rules: options === undefined ? {} : { [spec.name]: options },
  } as TypespeclintConfig
  const rule = toLinterRule(spec, async () => config)
  // The compiler's tester is typed for rules without options; ours take any.
  return createLinterRuleTester(await Tester.createInstance(), rule as never, 'typespeclint')
}

/** A fully compliant service used as the baseline for "valid" cases. */
export const SERVICE = `
  @service
  @useAuth(BearerAuth)
  namespace Shop;
`
