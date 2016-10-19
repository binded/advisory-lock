export const conString = process.env.PG_CONNECTION_STRING
  || 'postgres://postgres@127.0.0.1/advisorylock'

export const timeout = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms))

