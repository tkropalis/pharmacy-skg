import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corfuDutyList, corfuDuties, corfuRoster } from '../cities/corfu.ts';
import { corfuPlace } from './places.ts';
import { parseCorfuDuties, parseCorfuMembers, splitAddressAndPhone } from './parse.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/corfu/${name}`, import.meta.url), 'utf8');

const duties = parseCorfuDuties(fixture('2026-11-02_phduties.html'));
const members = parseCorfuMembers(fixture('2026-11-02_members.html'));

describe('splitAddressAndPhone', () => {
  it.each([
    ['ΜΙΛΤΙΑΔΟΥ ΜΑΡΓΑΡΙΤΗ 8  - ΤΗΛ. 2661031992', 'ΜΙΛΤΙΑΔΟΥ ΜΑΡΓΑΡΙΤΗ 8', '2661031992'],
    ['ΛΕΥΚΙΜΜΗ - ΤHΛ. 2662022649', 'ΛΕΥΚΙΜΜΗ', '2662022649'], // a Latin H
    [
      'ΔΟΝΑΤΟΥ ΔΗΜΟΥΛΙΤΣΑ 20 - ΠΛ. ΨΥΧΙΑΤΡΕΙΟΥ  THL. 2661080619',
      'ΔΟΝΑΤΟΥ ΔΗΜΟΥΛΙΤΣΑ 20 - ΠΛ. ΨΥΧΙΑΤΡΕΙΟΥ',
      '2661080619',
    ],
    ['ΤΡΙΑ ΓΕΦΥΡΙΑ/ΚΑΝΑΛΙΑ - ΤΗΛ: 26610 20376', 'ΤΡΙΑ ΓΕΦΥΡΙΑ/ΚΑΝΑΛΙΑ', '2661020376'],
    ['ΜΗΤ. ΜΕΘΟΔΙΟΥ 3 (ΣΑΡΟΚΟ) - ΤΗΛ.2661023678', 'ΜΗΤ. ΜΕΘΟΔΙΟΥ 3 (ΣΑΡΟΚΟ)', '2661023678'],
    ['ΚΟΜΠΙΤΣΙ - ΤΗΛ 2661052336', 'ΚΟΜΠΙΤΣΙ', '2661052336'],
    ['ΚΑΝΑΛΙΑ - 2661039264', 'ΚΑΝΑΛΙΑ', '2661039264'], // no marker
    [
      'ΠΛ. ΓΕΩΡΓΙΟΥ ΘΕΟΤΟΚΗ 9 (ΣΑΡΟΚΟ) - ΤΗΛ. 2661037872 - 2661044720',
      'ΠΛ. ΓΕΩΡΓΙΟΥ ΘΕΟΤΟΚΗ 9 (ΣΑΡΟΚΟ)',
      '2661037872',
    ],
    ['ΣΑΜΑΡΑ 7-9 (ΠΕΖΟΔΡΟΜΟΣ) - ΤΗΛ: 26610 32080', 'ΣΑΜΑΡΑ 7-9 (ΠΕΖΟΔΡΟΜΟΣ)', '2661032080'],
    [
      'ΓΕΡ. ΛΥΧΝΟΥ 2 &amp; Π. ΚΩΝΣΤΑΝΤΑ  - ΤΗΛ. 2661043339',
      'ΓΕΡ. ΛΥΧΝΟΥ 2 & Π. ΚΩΝΣΤΑΝΤΑ',
      '2661043339',
    ],
  ])('splits "%s"', (line, address, phone) => {
    expect(splitAddressAndPhone(line)).toEqual({ address, phone });
  });

  it('gives no phone when the line prints none', () => {
    expect(splitAddressAndPhone('ΚΑΣΣΙΩΠΗ')).toEqual({ address: 'ΚΑΣΣΙΩΠΗ', phone: '' });
  });
});

describe('parseCorfuDuties', () => {
  it("reads the page's date and the five pharmacies under the one heading of 2 Nov 2026", () => {
    expect(duties.date).toBe('2026-11-02');
    expect(duties.blocks).toHaveLength(1);
    expect(duties.blocks[0]?.heading).toBe('ΔΙΗΜΕΡΕΥΟΥΝ ΑΠΟ ΤΙΣ 8:00 ΕΩΣ ΤΙΣ 21:00');
    expect(duties.blocks[0]?.pharmacies).toEqual([
      {
        name: 'ΕΡΤΣΟΣ ΣΠΥΡΙΔΩΝΑΣ-ΠΑΝΑΓΙΩΤΗΣ',
        address: 'ΜΙΛΤΙΑΔΟΥ ΜΑΡΓΑΡΙΤΗ 8',
        phone: '2661031992',
      },
      { name: 'ΡΙΖΟΣ ΔΗΜΗΤΡΗΣ', address: 'ΒΡΥΩΝΗ', phone: '2661080646' },
      { name: 'ΒΑΛΣΑΜΗ ΕΛΕΥΘΕΡΙΑ', address: 'ΑΓΡΟΣ', phone: '2663071241' },
      { name: 'ΓΑΣΤΕΡΑΤΟΥ ΔΗΜΗΤΡΑ', address: 'ΠΕΡΙΦΕΡΕΙΑΚΗ ΟΔΟΣ ΠΕΡΙΒΟΛΙΟΥ', phone: '2662023160' },
      { name: 'ΣΤΑΜΑΤΑΚΟΣ ΑΛΕΞΑΝΔΡΟΣ', address: 'ΛΕΥΚΙΜΜΗ', phone: '2662022649' },
    ]);
  });

  it('fails on a page with no date, rather than guessing one', () => {
    expect(() => parseCorfuDuties('<html><body></body></html>')).toThrow(/no date/);
  });

  it('reads a night block under its own heading', () => {
    const page = `<h3>Τρίτη 03/11/2026</h3>
      <center><span style="color: #800000"><u><strong>ΔΙΑΝΥΚΤΕΡΕΥΟΥΝ ΑΠΟ ΤΙΣ 21:00 ΕΩΣ ΤΙΣ 8:00</strong></u></span></center>
      <center><span style="color: #000080"><strong>ΡΙΖΟΣ ΔΗΜΗΤΡΗΣ</strong></span><br>ΒΡΥΩΝΗ - ΤΗΛ. 2661080646<br><strong>DIMITRIOS RIZOS</strong><br>VRIONI - TEL. 2661080646</center>`;
    const parsed = parseCorfuDuties(page);
    expect(parsed.date).toBe('2026-11-03');
    const { list } = corfuDutyList(parsed);
    expect(list?.sections[0]).toMatchObject({
      kind: 'overnight',
      hours: { from: '21:00', to: '08:00', toNextDay: true },
    });
  });
});

describe('corfuDuties', () => {
  it('reads the headings the page and the platform it resembles print', () => {
    const at = (heading: string) =>
      corfuDuties(heading, '2026-11-02')?.map((d) => [d.kind, d.hours]);
    expect(at('ΔΙΗΜΕΡΕΥΟΥΝ ΑΠΟ ΤΙΣ  8:00  ΕΩΣ ΤΙΣ  21:00')).toEqual([
      ['day', { from: '08:00', to: '21:00', toNextDay: false }],
    ]);
    expect(at('ΔΙΑΝΥΚΤΕΡΕΥΟΥΝ ΑΠΟ ΤΙΣ 21:00 ΕΩΣ ΤΙΣ 8:00')).toEqual([
      ['overnight', { from: '21:00', to: '08:00', toNextDay: true }],
    ]);
    expect(at('ΔΙΗΜΕΡΕΥΟΥΝ')).toEqual([['day', null]]);
    expect(at('ΔΙΑΝΥΚΤΕΡΕΥΟΥΝ')).toEqual([['overnight', null]]);
  });

  it('does not read a heading it does not understand', () => {
    expect(corfuDuties('ΚΛΕΙΣΤΑ', '2026-11-02')).toBeNull();
  });
});

describe('corfuDutyList', () => {
  it('gives the area one group, each pharmacy placed by its village', () => {
    const { list, warnings } = corfuDutyList(duties);
    expect(warnings).toEqual([]);
    expect(list?.groupId).toBe('corfu');
    expect(list?.date).toBe('2026-11-02');
    expect(list?.sections).toHaveLength(1);
    expect(list?.sections[0]?.entries.map((e) => e.locality)).toEqual([
      'Κέρκυρα',
      'Βρυώνη',
      'Άγρος',
      'Περιβόλι',
      'Λευκίμμη',
    ]);
  });

  it('reports a heading it cannot read and leaves its pharmacies out', () => {
    const { list, warnings } = corfuDutyList({
      date: '2026-11-02',
      blocks: [
        { heading: 'ΚΛΕΙΣΤΑ', pharmacies: [{ name: 'Α Β', address: 'Γ 1', phone: '2661000001' }] },
      ],
    });
    expect(list).toBeNull();
    expect(warnings.map((w) => w.code)).toEqual(['unknown-heading']);
  });
});

describe('the same day in the evening', () => {
  const evening = parseCorfuDuties(fixture('2026-11-02_phduties_evening.html'));

  it('adds the night blocks to the day block, under the same date', () => {
    expect(evening.date).toBe('2026-11-02');
    expect(evening.blocks.map((block) => [block.heading, block.pharmacies.length])).toEqual([
      ['ΔΙΗΜΕΡΕΥΟΥΝ ΑΠΟ ΤΙΣ 8:00 ΕΩΣ ΤΙΣ 21:00', 5],
      ['ΔΙΑΝΥΚΤΕΡΕΥΟΥΝ ΑΠΟ ΤΙΣ 21:00 ΕΩΣ ΤΙΣ 22:00', 1],
      ['ΔΙΑΝΥΚΤΕΡΕΥΟΥΝ ΑΠΟ ΤΙΣ 21:00 ΕΩΣ ΤΙΣ 8:00 ΤΟ ΠΡΩΙ ΤΗΣ ΕΠΟΜΕΝΗΣ', 4],
    ]);
  });

  it('reads the night as ending the next morning', () => {
    const { list, warnings } = corfuDutyList(evening);
    expect(warnings).toEqual([]);
    expect(list?.sections.map((s) => [s.hours?.from, s.hours?.to, s.hours?.toNextDay])).toEqual([
      ['08:00', '21:00', false],
      ['21:00', '22:00', false],
      ['21:00', '08:00', true],
    ]);
  });
});

describe('parseCorfuMembers', () => {
  it('reads the 117 rows of the members page, each with a valid phone', () => {
    expect(members).toHaveLength(117);
    expect(members.every((m) => /^[26]\d{9}$/.test(m.phone))).toBe(true);
    expect(members[0]).toEqual({
      name: 'ΑΓΑΘΟΣ ΙΩΑΝΝΗΣ',
      address: 'ΑΛΕΠΟΥ  (ENANTI Super market Diellas)'.replace(/\s+/g, ' '),
      phone: '2661058290',
    });
  });
});

describe('corfuRoster', () => {
  it('is one pharmacy per phone, named by its members', () => {
    const { roster, warnings } = corfuRoster(members, { today: '2026-11-02', before: null });
    expect(warnings).toEqual([]);
    expect(roster.entries).toHaveLength(104);
    expect(new Set(roster.entries.map((e) => e.phone)).size).toBe(104);
    expect(roster.entries.find((e) => e.phone === '2661020970')?.name).toBe(
      'ΚΟΣΚΙΝΑΣ ΝΙΚΟΣ - ΚΟΣΚΙΝΑΣ ΣΠΥΡΟΣ',
    );
    expect(roster.sweptAt).toBe('2026-11-02');
  });

  it('keeps the date a pharmacy was first named', () => {
    const first = corfuRoster(members, { today: '2026-11-02', before: null }).roster;
    const again = corfuRoster(members, { today: '2026-11-09', before: first }).roster;
    expect(again.sweptAt).toBe('2026-11-09');
    expect(again.entries.every((e) => e.date === '2026-11-02')).toBe(true);
  });

  it('reports a member with no valid phone, who cannot be told from another pharmacy', () => {
    const { roster, warnings } = corfuRoster([{ name: 'Α Β', address: 'ΚΑΣΣΙΩΠΗ', phone: '' }], {
      today: '2026-11-02',
      before: null,
    });
    expect(roster.entries).toEqual([]);
    expect(warnings.map((w) => w.code)).toEqual(['member-no-phone']);
  });
});

describe('corfuPlace', () => {
  it.each([
    ['ΜΙΛΤΙΑΔΟΥ ΜΑΡΓΑΡΙΤΗ 8', 'Κέρκυρα', true],
    ['ΒΡΥΩΝΗ', 'Βρυώνη', true],
    ['ΔΙΑΣΤΑΥΡΩΣΗ ΒΡΥΩΝΗ', 'Βρυώνη', true],
    ['ΕΘΝ. ΠΑΛΑΙΟΚΑΣΤΡΙΤΣΑΣ 183 - ΓΑΡΔΕΛΑΔΕΣ', 'Γαρδελάδες', true],
    ['ΕΘΝ. ΠΑΛΑΙΟΚΑΣΤΡΙΤΣΑΣ (ΔΟΥΚΑΔΕΣ)', 'Δουκάδες', true],
    ['ΜΩΡΑΪΤΙΚΑ', 'Μωραΐτικα', true],
    ['ΛΑΚΚΑ ΠΑΞΩΝ', 'Λάκκα', true],
    ['ΕΠΑΡΧ. ΟΔΟΣ ΠΕΡΟΥΛΑΔΩΝ - ΣΙΔΑΡΙΟΥ', 'Περουλάδες', true],
    // A village not listed: the town, and not known.
    ['ΧΩΡΙΟ ΠΟΥ ΔΕΝ ΞΕΡΟΥΜΕ', 'Κέρκυρα', false],
  ])('puts "%s" in %s', (address, place, known) => {
    expect(corfuPlace(address)).toEqual({ place, known });
  });

  it('knows every village the members page names, by day or by night', () => {
    const unknown = members.filter((m) => !corfuPlace(m.address).known).map((m) => m.address);
    // Only streets without a number or a village name are left to the town.
    expect(unknown).toEqual([]);
  });
});
