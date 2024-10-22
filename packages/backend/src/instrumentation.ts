import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { WinstonInstrumentation } from '@opentelemetry/instrumentation-winston';
import { logs } from '@opentelemetry/api-logs';
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';

// import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
// For troubleshooting, set the log level to DiagLogLevel.DEBUG
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const resource = new Resource({
  [ATTR_SERVICE_NAME]: 'baseball-bat',
});

const provider = new LoggerProvider({
  resource,
});

provider.addLogRecordProcessor(
  new BatchLogRecordProcessor(new OTLPLogExporter()),
);

logs.setGlobalLoggerProvider(provider);

const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [new WinstonInstrumentation()],
});

sdk.start();
