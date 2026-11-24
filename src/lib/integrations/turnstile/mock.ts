import type { TurnstileClient } from './types'

/** Dev and test stand-in: any non-empty token passes, except the literal 'fail'. */
export const mockTurnstile: TurnstileClient = {
  async verify(token: string): Promise<boolean> {
    return token.length > 0 && token !== 'fail'
  },
}
