import { describe, expect, it } from 'vitest';
import { autoLocateDecision } from './geolocation.ts';

const base = {
  dismissed: false,
  areaChosen: false,
  permission: 'prompt',
  remembered: false,
} as const;

describe('autoLocateDecision', () => {
  it('asks on a first visit and when the permission is already granted or unknown', () => {
    expect(autoLocateDecision(base)).toBe('locate');
    expect(autoLocateDecision({ ...base, permission: 'granted' })).toBe('locate');
    expect(autoLocateDecision({ ...base, permission: 'unknown' })).toBe('locate');
  });

  it('does not ask when the browser has the permission denied', () => {
    expect(autoLocateDecision({ ...base, permission: 'denied' })).toBe('denied');
  });

  it('does not ask when the person chose an area', () => {
    expect(autoLocateDecision({ ...base, areaChosen: true })).toBe('skip');
    expect(autoLocateDecision({ ...base, areaChosen: true, permission: 'denied' })).toBe('skip');
  });

  it('does not ask when the person dismissed the position', () => {
    expect(autoLocateDecision({ ...base, dismissed: true })).toBe('skip');
    expect(autoLocateDecision({ ...base, dismissed: true, permission: 'granted' })).toBe('skip');
  });

  it('starts from the remembered position instead of asking again', () => {
    // Safari forgets an "Allow": the Permissions API says "prompt" (or nothing) on a later visit.
    expect(autoLocateDecision({ ...base, remembered: true })).toBe('remembered');
    expect(autoLocateDecision({ ...base, remembered: true, permission: 'unknown' })).toBe(
      'remembered',
    );
  });

  it('refreshes the position by itself where the browser kept the permission', () => {
    expect(autoLocateDecision({ ...base, remembered: true, permission: 'granted' })).toBe('locate');
  });

  it('never uses the remembered position against a choice or a block', () => {
    expect(autoLocateDecision({ ...base, remembered: true, areaChosen: true })).toBe('skip');
    expect(autoLocateDecision({ ...base, remembered: true, dismissed: true })).toBe('skip');
    expect(autoLocateDecision({ ...base, remembered: true, permission: 'denied' })).toBe('denied');
  });
});
