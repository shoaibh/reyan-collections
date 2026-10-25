import { execSync } from 'node:child_process'

const TEST_DATABASE_URI = 'postgres://shoaibhamza@localhost:5432/reyan_test'

/**
 * Resets the test database and seeds it through Payload's local API (`pnpm seed`).
 * DATABASE_URI is passed explicitly so the value in .env never wins.
 */
export default function globalSetup() {
  const env = { ...process.env, DATABASE_URI: TEST_DATABASE_URI }
  // The web server is started first, but its readiness URL is a static file, so it holds no DB connections yet.
  execSync('pnpm db:reset:test', { stdio: 'inherit', env })
  execSync('pnpm seed', { stdio: 'inherit', env })
}
