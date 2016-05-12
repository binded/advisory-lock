# advisory-lock

[![Build Status](https://travis-ci.org/blockai/advisory-lock.svg?branch=master)](https://travis-ci.org/blockai/advisory-lock)

Distributed locking using [PostgreSQL advisory locks](http://www.postgresql.org/docs/current/static/explicit-locking.html#ADVISORY-LOCKS).

Some use cases:

- You have a ["clock process"](https://devcenter.heroku.com/articles/scheduled-jobs-custom-clock-processes)
  and want to make absolutely sure there will never be more than one
  process active at any given time. This sort of situation could
  otherwise happen if you scale up the process by accident or through a
  zero downtime deploy mechanism that keeps the old version of the
  process running while the new one is starting.

- You run an Express based web app and want to post a message to Slack
  every 30 mins containing some stats (new registrations in last 30 mins
  for example). You might have 10 web server processes running but don't
  want to get X messages in Slack (only one is enough). You can use this
  library to elect a "master" process which sends the messages.

- [etc.](http://lmgtfy.com/?q=distributed%20lock)

## Install

```
npm install --save advisory-lock
```

## Usage

### advisoryLock(connectionString)(lockName)

- `connectionString` must be a Postgres connection string
- `lockName` must be a unique identifier for the lock

Returns a **mutex** object containing the Promise returning
functions listed below. For a better understanding of what they do,
see [PosgtreSQL's manual](http://www.postgresql.org/docs/current/static/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

#### withLock(fn)

- `fn` Promise returning function or regular function to be executed once the lock is acquired

Like `lock()` but automatically release the lock after `fn()` resolves.

Returns a promise which resolves to the value `fn` resolves to.

Throws an error if the Postgres connection closes unexpectedly.

#### tryLock()

Returns a promise which resolves to `true` if the lock is free and
`false` if the lock is taken. Doesn't "block".

#### lock()

Wait until we get exclusive lock.

#### unlock()

Release the exclusive lock.

#### tryLockShared()

Like `tryLock()` but for shared lock.

#### lockShared()

While held, this blocks any attempt to obtain an exclusive lock. (e.g.: calls to `.lock()` or `.withLock()`)

#### unlockShared()

Release shared lock.

#### withLockShared(fn)

Same as `withLock()` but using a shared lock.

## Example

```javascript
import advisoryLock from 'advisory-lock'
const mutex = advisoryLock('postgres://user:pass@localhost:3475/dbname')('some-lock-name')

const doSomething = () => {
  // doSomething
  return Promise.resolve()
}

mutex
  .withLock(doSomething) // "blocks" until lock is free
  .catch((err) => {
    // this gets executed if the postgres connection closes unexpectedly, etc.
  })
  .then(() => {
    // lock is released now...
  })

// doesn't "block"
mutex.tryLock().then((obtainedLock) => {
  if (obtainedLock) {
    return doSomething().then(() => mutex.unlock())
  } else {
    throw new Error('failed to obtain lock')
  }
})

```

See [./test](./test) for more usage examples.

## Roadmap

pgmutex binary which waits for exclusive lock before starting process
passed as argument. e.g: `pgmutex ./path/to/worker`

