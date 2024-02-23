import { emailIdentity } from '@bbat/common/types';
import setup from '../setup';
import * as defs from '@/services/reports/definitions';
import { createPayerProfileFromEmailIdentity } from '@/services/payers/definitions';
import assert from 'assert';
import parsePdf from 'pdf-parse';

setup('Reports service', ({ test }) => {
  test('rendering', async ({ bus }) => {
    const payer = await bus.exec(createPayerProfileFromEmailIdentity, {
      id: emailIdentity('test@test.test'),
      name: 'Teppo Testaaja',
    });

    assert.ok(payer);

    const report = await bus.exec(defs.createReport, {
      template: 'test',
      name: 'Test Report',
      payload: { value: 'TESTVALUE' },
      options: {},
      generatedBy: payer.id,
    });

    assert.equal(report.status, 'finished');

    const content = await bus.exec(defs.getReportContent, report.id);

    assert.ok(content);

    const { text: pdf } = await parsePdf(Buffer.from(content, 'base64'));

    assert.ok(pdf.includes('Test: TESTVALUE'));
  });
});
