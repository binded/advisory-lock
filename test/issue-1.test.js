import test from 'tape'
import pg from 'pg'
import advisoryLock from '../src'
import { conString, timeout } from './common'

// Returns the number of active connections to the database
const getActiveConnections = () => new Promise((resolve, reject) => {
  const sql = 'SELECT count(*) FROM pg_stat_activity'
  const client = new pg.Client(conString)
  client.connect((connectError) => {
    if (connectError) return reject(connectError)
    client.query(sql, (queryError, result) => {
      if (queryError) return reject(queryError)
      resolve(Number(result.rows[0].count))
      client.end()
    })
  })
})

test('withLock releases connection after unlocking', (t) => {
  getActiveConnections().then((startConnectionCount) => {
    for (let i = 0; i < 25; i++) {
      const createMutex = advisoryLock(conString)
      createMutex('test-withlock-release').withLock().catch(t.fail).then(() => {
        createMutex.client.end()
      })
    }
    timeout(500).then(() => {
      getActiveConnections().then((connectionCount) => {
        t.equal(connectionCount, startConnectionCount)
        t.end()
      })
    })
  })
})
