// Load .env files
import 'dotenv/config'

// Integration tests always run against the dedicated test database
process.env.DATABASE_URI = 'postgres://shoaibhamza@localhost:5432/reyan_test'
