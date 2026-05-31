import dotenv from 'dotenv'

import { createApp } from './app.js'

dotenv.config({ override: true })

const app = createApp()
const port = Number(process.env.PORT ?? 4000)

app.listen(port, () => {
  console.log(`TaskFlow API listening on port ${port}`)
})