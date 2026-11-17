import assert from 'node:assert';
import { describe, test } from 'node:test';
import { Readable, Writable } from 'node:stream';
import { AxiosError, AxiosHeaders } from 'axios';
import express from 'express';
import * as t from 'io-ts';
import Stripe from 'stripe';
import { REDACTED, createLogger, redactUrl } from '@/logger';
import { describeErrors } from '@/validation-errors';

const capture = () => {
  const lines: Record<string, unknown>[] = [];

  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()));
      callback();
    },
  });

  return { logger: createLogger(stream), lines };
};

describe('logger', () => {
  test('writes one JSON object per line with the shared schema', () => {
    const { logger, lines } = capture();

    logger.info({ job_id: '1' }, 'Job finished');

    assert.equal(lines.length, 1);
    const [line] = lines;
    assert.equal(line.level, 'info');
    assert.equal(line.msg, 'Job finished');
    assert.equal(line.service, 'baseball-bat');
    assert.equal(line.job_id, '1');
    assert.ok(!Number.isNaN(Date.parse(line.time as string)));
    assert.ok(!('pid' in line));
    assert.ok(!('hostname' in line));
  });

  test('serializes errors under err', () => {
    const { logger, lines } = capture();

    logger.error({ err: new TypeError('boom') }, 'Failed');

    const err = lines[0].err as Record<string, unknown>;
    assert.equal(err.type, 'TypeError');
    assert.equal(err.message, 'boom');
    assert.match(err.stack as string, /TypeError: boom/);
  });

  test('strips request config, including auth headers, from axios errors', () => {
    const { logger, lines } = capture();

    const config = {
      method: 'get',
      baseURL: 'http://event-api/',
      url: '/api/events?token=abc',
      headers: new AxiosHeaders({ 'X-Token': 'super-secret' }),
    };

    const err = new AxiosError(
      'Request failed with status 502',
      'ERR_BAD_RESPONSE',
      config,
      { path: '/api/events?token=abc' },
      {
        status: 502,
        statusText: 'Bad Gateway',
        data: 'Bad gateway',
        headers: {},
        config,
      },
    );

    logger.error({ err }, 'Failed to fetch events');

    assert.ok(!JSON.stringify(lines[0]).includes('super-secret'));
    assert.deepStrictEqual(
      { ...(lines[0].err as object), stack: undefined },
      {
        type: 'AxiosError',
        message: 'Request failed with status 502',
        stack: undefined,
        code: 'ERR_BAD_RESPONSE',
        method: 'GET',
        url: 'http://event-api/api/events?token=REDACTED',
        statusCode: 502,
      },
    );
  });

  test('redacts secrets', () => {
    const { logger, lines } = capture();

    logger.info(
      {
        token: 'a',
        user: { password: 'b' },
        req: {
          headers: {
            authorization: 'Bearer c',
            'x-token': 'd',
            'stripe-signature': 'e',
          },
        },
      },
      'test',
    );

    const [line] = lines as any[];
    assert.equal(line.token, REDACTED);
    assert.equal(line.user.password, REDACTED);
    assert.deepStrictEqual(line.req.headers, {
      authorization: REDACTED,
      'x-token': REDACTED,
      'stripe-signature': REDACTED,
    });
  });

  test('drops request data that libraries attach to errors', async () => {
    const { logger, lines } = capture();

    // body-parser attaches the raw request body to JSON syntax errors.
    const bodyParserError = await new Promise<Error>(resolve => {
      const req = Object.assign(
        Readable.from([Buffer.from('{"password":"hunter2",')]),
        {
          headers: {
            'content-type': 'application/json',
            'content-length': '22',
          },
        },
      );
      express.json()(req as any, {} as any, err => resolve(err));
    });
    assert.equal((bodyParserError as any).body, '{"password":"hunter2",');

    // The type definitions don't declare the constructor's arguments.
    const StripeSignatureVerificationError = Stripe.errors
      .StripeSignatureVerificationError as unknown as new (
      header: string,
      payload: string,
      raw: { message: string },
    ) => Error;
    const stripeError = new StripeSignatureVerificationError(
      'sig_header_value',
      '{"customer_email":"payer@example.com"}',
      { message: 'No signatures found matching the expected signature' },
    );

    logger.warn({ err: bodyParserError }, 'Bad body');
    logger.warn({ err: stripeError }, 'Bad signature');

    const out = JSON.stringify(lines);
    for (const secret of ['hunter2', 'sig_header_value', 'payer@example']) {
      assert.ok(!out.includes(secret), `${secret} leaked: ${out}`);
    }

    const [bodyLine, stripeLine] = lines as any[];
    assert.equal(bodyLine.err.type, 'SyntaxError');
    assert.equal(bodyLine.err.status, 400);
    assert.equal(stripeLine.err.type, 'StripeSignatureVerificationError');
    assert.match(stripeLine.err.message, /No signatures found/);
  });

  test('logs thrown primitives in the err schema', () => {
    const { logger, lines } = capture();

    logger.error({ err: 'Debt not due yet' }, 'Failed');

    assert.deepStrictEqual((lines[0] as any).err, {
      type: 'string',
      message: 'Debt not due yet',
    });
  });

  test('keeps only the message of thrown non-Error objects', () => {
    const { logger, lines } = capture();

    logger.error({ err: { message: 'Not found', email: 'x@y.z' } }, 'Failed');

    assert.deepStrictEqual((lines[0] as any).err, {
      type: 'Object',
      message: 'Not found',
    });
  });
});

describe('redactUrl', () => {
  test('masks sensitive query parameters', () => {
    assert.equal(
      redactUrl('/api/session/callback?code=abc&state=def&iss=x'),
      '/api/session/callback?code=REDACTED&state=REDACTED&iss=x',
    );
    assert.equal(
      redactUrl('/api/reports/1/content?token=secret'),
      '/api/reports/1/content?token=REDACTED',
    );
  });

  test('leaves other URLs untouched', () => {
    assert.equal(redactUrl('/api/debts?limit=10'), '/api/debts?limit=10');
    assert.equal(redactUrl('/api/debts'), '/api/debts');
    assert.equal(redactUrl(undefined), undefined);
  });
});

describe('describeErrors', () => {
  test('reports paths and expected types without values', () => {
    const type = t.type({ user: t.type({ email: t.string }) });
    const result = type.decode({ user: { email: 42 } });

    assert.ok(result._tag === 'Left');
    assert.deepStrictEqual(describeErrors(result.left), [
      { path: 'user.email', expected: 'string' },
    ]);
  });
});
