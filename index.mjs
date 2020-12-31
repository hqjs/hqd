#!/usr/bin/env -S SUPPRESS_NO_CONFIG_WARNING=true node --experimental-json-modules

import config from 'config';
import { getPort } from './utils.mjs';
import path from 'path';
import start from './server.mjs';
import yargs from 'yargs';

const PORT = 10000;

const readConf = (prop, def) => {
  try {
    return config.get(prop);
  } catch {
    return def;
  }
};

(async () => {
  const port = await getPort(PORT);
  const { argv } = yargs(process.argv)
    .usage('$0 [-chpr]')
    .options({
      c: {
        alias: 'cert',
        default: readConf('cert', 'cert'),
        describe: 'https certificates folder',
        type: 'string',
      },
      h: {
        alias: 'host',
        default: readConf('host', 'localhost'),
        describe: 'server host name',
        type: 'string',
      },
      p: {
        alias: 'port',
        default: readConf('port', port),
        describe: 'preferred server port',
        type: 'number',
      },
      r: {
        alias: 'root',
        default: path.resolve(),
        describe: 'root folder',
        type: 'string',
      },
      s: {
        alias: 'stream',
        describe: 'stream files instead of saving them on a disk',
        type: 'boolean',
      },
    })
    .help();

  start({
    CERT: argv.c,
    HOST: argv.h,
    PORT: argv.p,
    ROOT: argv.r,
    STREAM: argv.s,
  });
})();
