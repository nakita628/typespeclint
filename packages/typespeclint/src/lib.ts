import { createTypeSpecLibrary } from '@typespec/compiler'

import { LIBRARY_NAME } from './constants/index.js'

export const $lib = createTypeSpecLibrary({
  name: LIBRARY_NAME,
  diagnostics: {},
})
