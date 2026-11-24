import { getPayload } from 'payload'

import config from '@/payload.config'

export const getClient = async () => getPayload({ config: await config })
