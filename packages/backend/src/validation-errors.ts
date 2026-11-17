import * as t from 'io-ts';

export type ValidationErrorDescription = {
  path: string;
  expected: string;
};

/**
 * Describes io-ts validation errors by the path and expected type of each
 * failing field, without the offending values. The values can contain
 * personal data (names, emails, bank details), so they are kept out of logs.
 */
export const describeErrors = (
  errors: t.Errors,
  limit = 10,
): ValidationErrorDescription[] =>
  errors.slice(0, limit).map(error => ({
    path: error.context
      .map(entry => entry.key)
      .filter(key => key !== '')
      .join('.'),
    expected: error.context[error.context.length - 1]?.type.name ?? 'unknown',
  }));
