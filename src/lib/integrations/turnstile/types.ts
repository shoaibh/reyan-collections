export interface TurnstileClient {
  verify(token: string, ip?: string): Promise<boolean>
}
