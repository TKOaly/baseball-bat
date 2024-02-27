import { emailIdentity } from '@bbat/common/types';
import setup from './setup';
import * as defs from '@/services/reports/definitions';
import { createPayerProfileFromEmailIdentity } from '@/services/payers/definitions';
import assert from 'assert';
import parsePdf from 'pdf-parse';
import { EventOf } from '@/bus';

setup('Reports service', ({ test }) => {
  test('rendering', async ({ bus, busRoot }) => {
    busRoot.provideNamed(defs.reportTypeIface, 'test', {
      getDetails: async () => ({ template: 'test' }),
      generate: async () => ({ value: 'TESTVALUE' }),
    });

    const payer = await bus.exec(createPayerProfileFromEmailIdentity, {
      id: emailIdentity('test@test.test'),
      name: 'Teppo Testaaja',
    });

    assert.ok(payer);

    const report = await bus.exec(defs.createReport, {
      template: 'test',
      name: 'Test Report',
      options: {},
      generatedBy: payer.id,
    });

    bus.context.pg.conn.query('COMMIT; BEGIN');

    assert.equal(report.status, 'generating');

    const event = await new Promise<EventOf<typeof defs.onReportStatusChanged>>(
      resolve => bus.on(defs.onReportStatusChanged, value => resolve(value)),
    );

    assert.equal(event.report, report.id);

    const content = await bus.exec(defs.getReportContent, report.id);
    assert.ok(content);

    const { text: pdf } = await parsePdf(Buffer.from(content, 'base64'));

    assert.ok(pdf.includes('Test: TESTVALUE'));
  });
});
