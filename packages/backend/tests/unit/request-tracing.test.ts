// Must come first, as the pino instrumentation patches pino when it is loaded.
import '@/instrumentation';
import assert from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { Writable } from 'node:stream';
import express from 'express';
import { createLogger } from '@/logger';
import { errorLogging, requestTracing } from '@/middleware/request-tracing';

const lines: any[] = [];

const logger = createLogger(
  new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()));
      callback();
    },
  }),
);

const app = express().use('/api', requestTracing(logger)).use(express.json());

const health = express.Router().get('/', (_req, res) => {
  res.json({ ok: true });
});

app
  .use('/api/health', health)
  .post('/api/echo', (req, res) => {
    setTimeout(() => {
      logger.info('inside handler');
      res.status(201).json(req.body);
    }, 5);
  })
  .get('/api/missing', (_req, res) => {
    res.sendStatus(404);
  })
  .get('/api/fail', () => {
    throw new Error('kaboom');
  })
  .use(errorLogging(logger));

let server: Server;
let base: string;

const request = async (path: string, init?: RequestInit) => {
  lines.length = 0;
  const res = await fetch(`${base}${path}`, init);
  await res.text();
  // The completion line is written on the response's `finish` event.
  await new Promise(resolve => setTimeout(resolve, 20));
  return res.status;
};

const completion = () => lines.find(line => line.msg === 'request completed');

describe('request tracing', () => {
  before(async () => {
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    server.close();
  });

  test('logs completed requests with the trace of the request span', async () => {
    const status = await request('/api/echo?token=secret', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });

    assert.equal(status, 201);

    const inner = lines.find(line => line.msg === 'inside handler');
    const line = completion();

    assert.equal(line.level, 'info');
    assert.equal(line.req.method, 'POST');
    assert.equal(line.req.url, '/api/echo?token=REDACTED');
    assert.equal(line.res.statusCode, 201);
    assert.equal(typeof line.responseTime, 'number');
    assert.match(line.trace_id, /^[0-9a-f]{32}$/);
    assert.equal(inner.trace_id, line.trace_id);
    assert.equal(inner.span_id, line.span_id);
  });

  test('logs 4xx responses as warnings', async () => {
    assert.equal(await request('/api/missing'), 404);
    assert.equal(completion().level, 'warn');
  });

  test('logs thrown errors and 5xx responses as errors', async () => {
    assert.equal(await request('/api/fail'), 500);

    const error = lines.find(
      line => line.msg === 'Unhandled error while handling request',
    );

    assert.equal(error.level, 'error');
    assert.equal(error.err.message, 'kaboom');
    assert.equal(completion().level, 'error');
  });

  test('keeps the status of client errors, without logging the body', async () => {
    const status = await request('/api/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"password":"hunter2",',
    });

    assert.equal(status, 400);
    assert.ok(!JSON.stringify(lines).includes('hunter2'));
    assert.equal(completion().level, 'warn');
  });

  test('logs successful health checks at debug level', async () => {
    assert.equal(await request('/api/health'), 200);
    // The logger runs at the default `info` level.
    assert.equal(completion(), undefined);
  });
});
