import winston from 'winston';
import yargs from 'yargs';

winston.configure({
  level: process.env.HQD_LOG_LEVEL || 'info',
  silent: (yargs.argv && yargs.argv.silent) || process.env.silent || false,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'output.log' }),
  ],
});

export default winston;
