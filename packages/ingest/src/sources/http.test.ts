import { describe, expect, it } from 'vitest';
import { describeError } from './http.ts';

describe('describeError', () => {
  it('adds what fetch puts only in the cause', () => {
    const error = new TypeError('fetch failed', {
      cause: new Error('getaddrinfo ENOTFOUND fsa.gr'),
    });
    expect(describeError(error)).toBe(
      'TypeError: fetch failed: Error: getaddrinfo ENOTFOUND fsa.gr',
    );
  });

  it('leaves an error without a cause as it prints', () => {
    expect(describeError(new Error('HTTP 421 for https://www.moh.gov.gr/'))).toBe(
      'Error: HTTP 421 for https://www.moh.gov.gr/',
    );
    expect(describeError('plain')).toBe('plain');
  });
});
