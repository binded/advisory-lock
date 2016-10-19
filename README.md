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

- Running database migration when app starts

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

## CLI Usage

A `withlock` command line utility is provided to make to facilitate the
common use case of ensuring only one instance of a process is running at any
time.

![withlock demo](./withlock-demo.gif)

```bash
withlock <lockName> [--db <connectionString>] -- <command>
```

Where `<lockName>` is the name of the lock, `<command>` (everything after
`--`) is the command to run exclusively, once the lock is acquired.
`--db <connectionString>` is optional and if not specified, the
`PG_CONNECTION_STRING` environment variable will be used.

Example:

```bash
export PG_CONNECTION_STRING="postgres://postgres@127.0.0.1/mydb"
withlock dbmigration -- npm run knex migrate:latest
```

## Usage

### advisoryLock(connectionString)

- `connectionString` must be a Postgres connection string

Returns a `createMutex` function.

The `createMutex` function also exposes a `client` property
that can be used to terminate the database connection if necessary.

PS: Each call to `advisoryLock(connectionString)` creates a new PostgreSQL
connection which is not automatically terminated, so if that is an
[issue for you](https://github.com/blockai/advisory-lock/issues/1), you
can use `createMutex.client.end()` to end the connection when
appropriate (e.g.  after releasing a lock). This is however typically
not needed since usually, `advisoryLock()` only needs to be called once.

### createMutex(lockName)

- `lockName` must be a unique identifier for the lock

Returns a **mutex** object containing the functions listed below. All
**object** methods are really just functions attached to the object and
are not bound to *this* so they can be safely destructured,
e.g. `const { withLock } = createMutext(lockName)`.

For a better understanding of what each functions does,
see [PosgtreSQL's manual](http://www.postgresql.org/docs/current/static/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

#### mutex.withLock(fn)

- `fn` Promise returning function or regular function to be executed once the lock is acquired

Like `lock()` but automatically release the lock after `fn()` resolves.

Returns a promise which resolves to the value `fn` resolves to.

Throws an error if the Postgres connection closes unexpectedly.

#### mutex.tryLock()

Returns a promise which resolves to `true` if the lock is free and
`false` if the lock is taken. Doesn't "block".

#### mutex.lock()

Wait until we get exclusive lock.

#### mutex.unlock()

Release the exclusive lock.

#### mutex.tryLockShared()

Like `tryLock()` but for shared lock.

#### mutex.lockShared()

While held, this blocks any attempt to obtain an exclusive lock. (e.g.: calls to `.lock()` or `.withLock()`)

#### mutex.unlockShared()

Release shared lock.

#### mutex.withLockShared(fn)

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

