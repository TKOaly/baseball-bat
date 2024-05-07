import { format } from "date-fns/format";
import auditApi from "../../api/audit";
import { InfiniteTable } from "../../components/infinite-table";
import { ResourceLink } from "../../components/resource-link";
import { cents, formatEuro } from "@bbat/common/src/currency";
import { AuditEvent, AuditEventAction } from "@bbat/common/src/types";
import { parseISO } from "date-fns/parseISO";

type Expression =
  | { type: 'reference', name: string }
  | { type: 'value', value: string | number | boolean }
  | { type: 'call', name: string, arguments: Expression[] }

const parseExpression = (input: string): Expression => {
  const trimmed = input.trim();
  let fnMatch = trimmed.match(/(\w+)\s*\((?:([^,)]+)(?:,\s*([^,)]+))*)?\)/);

  if (fnMatch) {
    return {
      type: 'call',
      name: fnMatch[1],
      arguments: fnMatch.splice(2).filter(x => x !== undefined).map(parseExpression),
    }
  }

  const strMatch = trimmed.match(/^(?:"([^"]*)"|'([^']*)')$/)

  if (strMatch) {
    return {
      type: 'value',
      value: strMatch[1] ?? strMatch[2],
    };
  }

  const refMatch = trimmed.match(/^([A-Za-z]\w*)$/)

  if (refMatch) {
    return {
      type: 'reference',
      name: refMatch[1], 
    };
  }

  throw new Error('Invalid expression: ' + trimmed);
};

const evaluateExpression = (expr: Expression, event: AuditEvent): (string | number | boolean | React.ReactNode) => {
  switch (expr.type) {
    case 'value':
      return expr.value;

    case 'reference':
      return (event.details as any)[expr.name]; 

    case 'call':
      const args: (string | number | boolean)[] = [];

      expr.arguments.forEach((argExpr) => {
        const arg = evaluateExpression(argExpr, event);

        if (typeof arg !== 'string' && typeof arg !== 'number' && typeof arg !== 'boolean') {
          throw new Error('Function call arguments must be either a number or a string! Got ' + (typeof arg));
        }

        args.push(arg);
      });

      return functions[expr.name](event, ...args);
  }
};

type Segment =
  | { type: 'literal', value: string }
  | { type: 'expression', value: Expression }

const parse = (input: string) => {
  const matches = input.matchAll(/{([^}]+)}/g);
  let indices = [0, input.length];
  let parts: Segment[] = [];

  [...matches].forEach((match, i) => {
    const before = input.substring(indices[i], match.index);
    indices.splice(i+1, 0, match.index + match[0].length);

    parts.push({
      type: 'literal',
      value: before,
    });

    parts.push({
      type: 'expression',
      value: parseExpression(match[1]),
    });
  });

  parts.push({
    type: 'literal',
    value: input.substring(indices.at(-2) ?? 0),
  });

  return parts;
};

const functions: Record<string, (event: AuditEvent, ...rest: (string | number | boolean)[]) => React.ReactNode> = {
  link(event, type, name) {
    const link = event.links.find(l => l.type === type);

    if (!link) {
      return "<Unknown>";
    }

    if (name !== undefined && typeof name !== 'string') {
      throw new Error('Invalid type for argument "name"! ' + name);
    }

    return <span className="font-semibold"><ResourceLink type={link.target.type} id={link.target.id} name={link.label} /></span>; 
  },

  cents(_event, value) {
    if (typeof value !== 'number') {
      return '<Invalid value>';
    }

    return formatEuro(cents(value));
  },

  date(_event, value, dateFormat) {
    if (dateFormat !== undefined && typeof dateFormat !== 'string') {
      throw new Error('Invalid type for argument "dateFormat"! ' + dateFormat);
    }

    if (typeof value !== 'string') {
      throw new Error('Invalid type for argument "value"!');
    }

    return format(parseISO(value), dateFormat ?? 'dd.MM.yyyy');
  },

  lookup(event, tableName, value) {
    const table = extraFormats[`${tableName}`];

    if (!table) {
      return '<Unknown>';
    }

    let format: string | undefined = table[`${value}`];

    if (!format) {
      format = table[DefaultCase];

      if (!format) {
        return '<Unknown>';
      }
    }

    return <ActionDescription event={event} format={format} />;
  },
  value(_, value) {
    return <span className="bg-gray-200 mx-1 rounded-sm px-1 text-xs shadow-sm font-mono">{`${value}`}</span>
  }
}

const formatExpression = (expr: Expression): string => {
  switch (expr.type) {
    case 'value':
      if (typeof expr.value === 'string') {
        return `'${expr.value}'`;
      } else {
        return `${expr.value}`;
      }

    case 'reference':
      return expr.name;

    case 'call':
      return `${expr.name}(${expr.arguments.map(formatExpression).join(', ')})`;
  }
};

const DefaultCase = Symbol('LookupDefaultCase');

const ActionDescription = ({ event, format: pFormat }: { event: AuditEvent, format?: string }) => {
  const format = pFormat ?? formats[event.action];

  if (!format) {
    return (
      <>
        Unkown event of type
        <span className="bg-gray-200 mx-1 rounded-sm px-1 text-xs shadow-sm font-mono">{`${event.action}`}</span>
        .
      </>
    );
  }

  const parts = parse(format);

  return parts.map((part) => {
    if (part.type === 'literal') {
      return part.value;
    }

    if (part.type === 'expression') {
      try {
        return evaluateExpression(part.value, event);
      } catch (err) {
        console.error(`Error while evaluating expression "${formatExpression(part.value)}":`, err);
        return '<Error>';
      }
    }
  });
}

const extraFormats: Record<string, Record<string, string> & { [DefaultCase]?: string }> = {
  payerCreationSource: {
    tkoaly: 'membership information',
    email: 'an email address',
  },
  debtFields: {
    dueDate: 'due date',
    paymentCondition: 'payment condition',
    [DefaultCase]: '{field}',
  },
  debtUpdate: {
    payerId: 'Changed the payer of debt {link("debt", name)} from {link("from", from)} to {link("to", to)}.',
    centerId: 'Changed the collection of debt {link("debt", name)} from {link("from", from)} to {link("to", to)}.',
    dueDate: 'Changed the due date of debt {link("debt", name)} from {date(from)} to {date(to)}.',
    [DefaultCase]: 'Update field {lookup("debtFields", field)} of debt {link("debt")} from value {from} to {to}.',
  },
};

const formats: Record<AuditEventAction, string> = {
  'debt.create': 'Created a debt {link("object")} for payer {link("debtor")} with a total of {cents(total)}.',
  'debt.publish': 'Published a debt {link("debt", name)} of {cents(total)} for payer {link("payer")}.',
  'debt.credit': 'Credited a debt {link("debt")} for payer {link("payer")} of amount {cents(total)}.',
  'debt.update.add-component': 'Added component "{componentName}" ({cents(componentAmount)}) to debt {link("debt")}.',
  'debt.update.remove-component': 'Removed component "{componentName}" ({cents(componentAmount)}) from debt {link("debt")}.',
  'debt.update': '{lookup("debtUpdate", field)}',
  'debt.delete': 'Deleted a debt named {name} of {cents(total)} for payer {link("payer", payer)}.',
  'payer.merge': 'Merged payer profile {link("from")} to {link("object")}.',
  'payer.update': 'Updated field {field} of payer {link("object")} from value {value(oldValue)} to {value(newValue)}.',
  'debt-center.create': 'Created a debt center named {link("center")}.',
  'debt-center.delete': 'Deleted a debt center named {link("center")}.',
  "bank-statement.create": 'Imported {link("statement", "a bank statement")} for time period {date(start)} - {date(end)}.',
  "payer.create": "Created a payer profile {link('object')} based on {lookup('payerCreationSource', source)}."
};

export const AuditEvents = () => {
  return (
    <>
      <h1 className="mb-5 mt-10 text-2xl">Audit Log</h1>
      <InfiniteTable
        endpoint={auditApi.endpoints.getAuditEvents}
        initialSort={{ column: 'Time', direction: 'desc' }}
        columns={[
          {
            name: 'Time',
            key: 'time',
            getValue: (row) => row.time.valueOf(),
            render: (value) => format(new Date(value), 'dd.MM.yyy HH:mm'),
          },
          {
            name: 'Subject',
            key: 'subject',
            getValue: (row) => row.subject?.value,
            render: (value) => value && (
              <ResourceLink type="payer" id={value} />
            ),
          },
          {
            name: 'Action',
            key: 'type',
            getValue: 'action',
            render: (_, row) => (
              <div>
                <ActionDescription event={row} />
              </div>
            ),
          },
        ]}
      />
    </>
  );
};
