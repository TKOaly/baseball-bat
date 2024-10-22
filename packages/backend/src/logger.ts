import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ level: true }),
        winston.format.printf(info => {
          const module = info.module ? `[${info.module}] ` : '';
          return `[${info.level}] ${module}${info.message}`;
        }),
      ),
    }),
  ],
});

export default logger;
