import type { PublishedDuty } from '@pharmacy-skg/core';
import { describe, expect, it } from 'vitest';
import { t } from '../i18n/index.ts';
import { describeDuty, dutyEnd, upcomingDuties } from './duties.ts';

const duty = (
  date: string,
  hours: PublishedDuty['hours'],
  kind: PublishedDuty['duty'] = 'overnight',
): PublishedDuty => ({ date, groupId: 'metro', duty: kind, heading: 'H', hours });

const night = { from: '22:00', to: '08:00', toNextDay: true };

describe('upcomingDuties', () => {
  const now = new Date('2026-10-06T04:00:00Z'); // 07:00 on the 6th in Athens
  const list = [
    duty('2026-10-04', night),
    duty('2026-10-05', night), // ends 08:00 on the 6th: still running at 07:00
    duty('2026-10-06', night),
    duty('2026-10-05', null), // a duty day runs until 08:00 the next morning: still on
    duty('2026-10-04', null), // ended on the 5th at 08:00
  ];
  it('keeps what has not ended, in the given order', () => {
    expect(upcomingDuties(list, now, 'Europe/Athens')).toEqual([list[1], list[2], list[3]]);
  });
  it('ends an overnight duty at the local time, not at UTC midnight', () => {
    expect(dutyEnd(duty('2026-10-05', night), 'Europe/Athens')).toEqual(
      new Date('2026-10-06T05:00:00Z'),
    );
  });
});

describe('describeDuty', () => {
  it('names the date, the kind and the hours', () => {
    expect(describeDuty(duty('2026-10-07', night), 'el', t('el').app)).toBe(
      'Τετ 7 Οκτ · διανυκτερεύον · 22:00–08:00',
    );
    expect(describeDuty(duty('2026-10-07', null, 'day'), 'en', t('en').app)).toBe(
      'Wed 7 Oct · all-day duty · hours not stated',
    );
  });
});
