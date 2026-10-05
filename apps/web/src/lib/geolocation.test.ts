import { describe, expect, it } from 'vitest';
import { autoLocateDecision } from './geolocation.ts';

const base = { dismissed: false, areaChosen: false, permission: 'prompt' } as const;

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
});
