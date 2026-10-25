// Load .env files
import 'dotenv/config'

import { testDbUri } from './tests/helpers/testDbUri'

// Integration tests always run against the dedicated test database
process.env.DATABASE_URI = testDbUri()
