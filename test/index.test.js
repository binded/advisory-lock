import test from 'tape'

import advisoryLock, { strToKey } from '../src'
import { conString, timeout } from './common'

test('strToKey', (t) => {
  const key = strToKey('test-lock')
  t.deepEqual(key, [-107789403, 1811518275], 'generates 2 integer key from string')
  t.end()
})

test('lock/unlock on same connection', (t) => {
  t.plan(3)

  const getMutex = advisoryLock(conString)

  const {
    lock,
    unlock,
  } = getMutex('test-lock')


  let i = 0

  const testLockUnlock = (iVal) => lock()
    .then(() => {
      t.equal(i, iVal, 'i is equal to 0')
      i++
      // wait 300ms before decrementing i
      return timeout(300)
    })
    .then(() => i--)
    .then(unlock)
    .catch(t.fail)

  testLockUnlock(0)
  testLockUnlock(1)
  testLockUnlock(2)
  // we can acquire lock both times because we're using the same connection
})

test('lock/unlock on different connections', (t) => {
  t.plan(5)

  let i = 0

  const testLockUnlock = ({ lock, unlock }) => lock()
    .then(() => {
      t.equal(i, 0, 'i is equal to 0')
      i++
      // wait 300ms before decrementing i
      return timeout(300)
    })
    .then(() => i--)
    .then(unlock)
    .catch(t.fail)

  testLockUnlock(advisoryLock(conString)('test-lock'))
  // blocks... because we're using different connections
  // advisoryLock(conString) creates a new connection
  testLockUnlock(advisoryLock(conString)('test-lock'))
  testLockUnlock(advisoryLock(conString)('test-lock'))
  testLockUnlock(advisoryLock(conString)('test-lock'))
  testLockUnlock(advisoryLock(conString)('test-lock'))
})

test('tryLock', (t) => {
  const mutex1 = advisoryLock(conString)('test-try-lock')
  const mutex2 = advisoryLock(conString)('test-try-lock')
  mutex1.tryLock()
    .then((obtained) => {
      t.equal(obtained, true)
    })
    .then(() => mutex2.tryLock())
    .then((obtained) => {
      t.equal(obtained, false)
    })
    .then(() => mutex1.unlock())
    .then(() => mutex2.tryLock())
    .then((obtained) => {
      t.equal(obtained, true)
    })
    .then(() => mutex1.tryLock())
    .then((obtained) => {
      t.equal(obtained, false)
    })
    .then(() => mutex2.unlock())
    .then(() => t.end())
    .catch(t.fail)
})

test('withLock followed by tryLock', (t) => {
  const mutex1 = advisoryLock(conString)('test-withlock-lock')
  const mutex2 = advisoryLock(conString)('test-withlock-lock')
  mutex1
    .withLock(() => (
      mutex2
        .tryLock()
        .then((obtained) => t.equal(obtained, false))
        .then(() => 'someval')
    ))
    .then((res) => t.equal(res, 'someval'))
    .then(() => mutex2.tryLock())
    .then((obtained) => t.equal(obtained, true))
    .then(() => mutex2.unlock())
    .then(() => t.end())
    .catch(t.fail)
})

test('withLock - no promise', (t) => {
  const mutex1 = advisoryLock(conString)('test-withlock-lock')
  mutex1
    .withLock(() => ('someval'))
    .then((res) => t.equal(res, 'someval'))
    .then(() => t.end())
    .catch(t.fail)
})

test('withLock blocks until lock available', (t) => {
  const mutex1 = advisoryLock(conString)('test-withlock-lock')
  const mutex2 = advisoryLock(conString)('test-withlock-lock')
  const logs = []
  const maybeDone = () => {
    if (logs.length !== 4) return
    const version1 = [
      'mutex1 enters',
      'mutex1 leaves',
      'mutex2 enters',
      'mutex2 leaves',
    ]
    const version2 = [
      'mutex2 enters',
      'mutex2 leaves',
      'mutex1 enters',
      'mutex1 leaves',
    ]
    if (logs[0] === version1[0]) {
      t.deepEqual(logs, version1)
    } else {
      t.deepEqual(logs, version2)
    }
    t.end()
  }
  mutex1
    .withLock(() => {
      logs.push('mutex1 enters')
      return timeout(300)
        .then(() => logs.push('mutex1 leaves'))
    })
    .then(maybeDone)
    .catch(t.fail)
  mutex2
    .withLock(() => {
      logs.push('mutex2 enters')
      return timeout(300)
        .then(() => logs.push('mutex2 leaves'))
    })
    .then(maybeDone)
    .catch(t.fail)
})

// TODO: test thowing inside critical section unlocks mutex
