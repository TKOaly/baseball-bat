import { emailIdentity } from '@bbat/common/types';
import setup from './setup';
import * as defs from '@/modules/reports/definitions';
import { createPayerProfileFromEmailIdentity } from '@/modules/payers/definitions';
import assert from 'assert';
import parsePdf from 'pdf-parse';
import { EventOf } from '@/bus';

setup('Reports service', ({ test }) => {
  test('rendering', async ({ withNewContext, bus }) => {
    const report = await withNewContext(async ({ busRoot, bus }) => {
      busRoot.provideNamed(defs.reportTypeIface, 'test', {
        getDetails: async () => ({ template: 'test' }),
        generate: async () => ({ value: 'TESTVALUE' }),
      });

      const payer = await bus.exec(createPayerProfileFromEmailIdentity, {
        id: emailIdentity('test@test.test'),
        name: 'Teppo Testaaja',
      });

      assert.ok(payer);

      return await bus.exec(defs.createReport, {
        template: 'test',
        name: 'Test Report',
        options: {},
      });
    });

    assert.equal(report.status, 'generating');

    const event = await new Promise<EventOf<typeof defs.onReportStatusChanged>>(
      resolve => bus.on(defs.onReportStatusChanged, value => resolve(value)),
    );

    assert.equal(event.report, report.id);

    const url = await bus.exec(defs.getReportUrl, report.id);
    assert.ok(url);

    const response = await fetch(url);
    const content = await response.blob();

    const { text: pdf } = await parsePdf(
      Buffer.from(await content.arrayBuffer()),
    );

    assert.ok(pdf.includes('Test: TESTVALUE'));
  });
});
