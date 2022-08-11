#!/usr/bin/env node
import advisoryLock from '../';
import parseArgs from 'minimist';
import { spawn } from 'child_process';

const errExit = (msg) => {
  console.error(msg);
  process.exit(1);
};

const getConnectionString = (args) => {
  if (args.db) return args.db;
  if (!('PG_CONNECTION_STRING' in process.env)) {
    errExit('PG_CONNECTION_STRING not found and no --db argument passed');
  }
  return process.env.PG_CONNECTION_STRING;
};

const args = parseArgs(process.argv.slice(2), { '--': true });

if (args._.length < 1) {
  errExit('No <lockName> specified');
}
if (args._.length > 1) {
  errExit(`Unknown arguments: ${args._.slice(1)}`);
}
if (!args['--'] || !args['--'].length) {
  errExit('No <command> specified');
}

const command = args['--'][0];
const commandArgs = args['--'].slice(1);
const connectionString = getConnectionString(args);
const lockName = args._[0];

const getChild = () =>
  spawn(command, commandArgs, {
    stdio: 'inherit',
  });

const createMutex = advisoryLock(connectionString);
const mutex = createMutex(lockName);

mutex
  .withLock(
    () =>
      new Promise((resolve, reject) => {
        console.log('Lock acquired');
        console.log(command);
        const child = getChild();
        child.on('error', reject);
        child.on('exit', resolve);
      }),
  )
  .catch(errExit)
  .then((exitCode) => {
    process.exit(exitCode);
  });
