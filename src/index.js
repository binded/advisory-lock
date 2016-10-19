import pg from 'pg'
import { createHash } from 'crypto'
import initDebug from 'debug'

const debug = initDebug('advisory-lock')
const noop = () => {}

// Converts string to 64 bit number for use with postgres advisory lock
// functions
export const strToKey = (name) => {
  // TODO: detect "in process" collisions?
  // Generate sha256 hash of name
  // and take 32 bit twice from hash
  const buf = createHash('sha256').update(name).digest()
  return [buf.readInt32LE(0), buf.readInt32LE(1)]
}

// Patches client so that unref works as expected... Node terminates
// only if there are not pending queries
const patchClient = (client) => {
  const connect = client.connect.bind(client)
  const query = client.query.bind(client)
  let refCount = 0

  const ref = () => {
    refCount++
    client.connection.stream.ref()
  }
  const unref = () => {
    refCount--
    if (!refCount) client.connection.stream.unref()
  }

  const wrap = (fn) => (...args) => {
    ref()
    const lastArg = args[args.length - 1]
    const lastArgIsCb = typeof lastArg === 'function'
    const outerCb = lastArgIsCb ? lastArg : noop
    if (lastArgIsCb) args.pop()
    const cb = (...cbArgs) => {
      unref()
      outerCb(...cbArgs)
    }
    args.push(cb)
    return fn(...args)
  }

  client.connect = wrap(connect)
  client.query = wrap(query)
  return client
}

const query = (client, lockFn, [key1, key2]) => new Promise((resolve, reject) => {
  const sql = `SELECT ${lockFn}(${key1}, ${key2})`
  debug(`query: ${sql}`)
  client.query(sql, (err, result) => {
    if (err) {
      debug(err)
      return reject(err)
    }
    resolve(result.rows[0][lockFn])
  })
})

// Pauses promise chain until pg client is connected
const initWaitForConnection = (client) => {
  const queue = []
  let waitForConnect = true
  debug('connecting')

  client.connect((err) => {
    waitForConnect = false
    if (err) {
      debug('connection error')
      debug(err)
      queue.forEach(([, reject]) => reject(err))
    } else {
      debug('connected')
      queue.forEach(([resolve]) => resolve())
    }
  })
  return () => new Promise((resolve, reject) => {
    if (!waitForConnect) return resolve()
    debug('waiting for connection')
    queue.push([resolve, reject])
  })
}

export default (conString) => {
  debug(`connection string: ${conString}`)
  const client = patchClient(new pg.Client(conString))
  const waitForConnection = initWaitForConnection(client)
  // TODO: client.connection.stream.unref()?

  const createMutex = (name) => {
    const key = typeof name === 'string' ? strToKey(name) : name

    const lock = () => query(client, 'pg_advisory_lock', key)
    const unlock = () => query(client, 'pg_advisory_unlock', key)
    const tryLock = () => query(client, 'pg_try_advisory_lock', key)

    // TODO: catch db disconnection errors?
    const withLock = (fn) => lock().then(() => Promise
      .resolve()
      .then(fn)
      .then(
        (res) => unlock().then(() => res),
        (err) => unlock().then(() => { throw err })
      )
    )

    const fns = { lock, unlock, tryLock, withLock }

    // "Block" function calls until client is connected
    const guardedFns = {}
    Object.keys(fns).forEach((fnName) => {
      guardedFns[fnName] = (...args) => (
        waitForConnection().then(() => fns[fnName](...args))
      )
    })
    return guardedFns
  }
  createMutex.client = client
  return createMutex
}
