import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';

// import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
// For troubleshooting, set the log level to DiagLogLevel.DEBUG
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const resource = new Resource({
  [ATTR_SERVICE_NAME]: 'baseball-bat',
});

const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter(),
  // Logs are only written to stdout, where the cluster's log collector picks
  // them up. Exporting them over OTLP as well would store every line twice.
  // An empty list stops NodeSDK from setting up its default OTLP log exporter.
  logRecordProcessors: [],
  instrumentations: [
    // Adds `trace_id`, `span_id` and `trace_flags` to log lines written
    // inside a span. Must be registered before `pino` is first imported.
    new PinoInstrumentation({ disableLogSending: true }),
  ],
});

sdk.start();
