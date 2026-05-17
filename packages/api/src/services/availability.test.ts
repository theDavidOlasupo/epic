import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
  isWindowCoveredByRules,
  luxonWeekdayToSchemaDow,
  type AvailabilityRuleRow,
} from './availability.js';

const TZ = 'America/Toronto';

function rule(
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  timezone = TZ,
): AvailabilityRuleRow {
  return {
    parkingSpotId: 'spot-1',
    dayOfWeek,
    startTime,
    endTime,
    timezone,
  };
}

/** Monday 2025-06-09 in Toronto */
function mondayAt(hour: number, minute = 0): Date {
  return DateTime.fromObject(
    { year: 2025, month: 6, day: 9, hour, minute },
    { zone: TZ },
  )
    .toUTC()
    .toJSDate();
}

/** Tuesday 2025-06-10 */
function tuesdayAt(hour: number, minute = 0): Date {
  return DateTime.fromObject(
    { year: 2025, month: 6, day: 10, hour, minute },
    { zone: TZ },
  )
    .toUTC()
    .toJSDate();
}

describe('luxonWeekdayToSchemaDow', () => {
  it('maps Sunday to 0', () => {
    expect(luxonWeekdayToSchemaDow(7)).toBe(0);
  });
  it('maps Monday to 1', () => {
    expect(luxonWeekdayToSchemaDow(1)).toBe(1);
  });
});

describe('isWindowCoveredByRules', () => {
  it('returns false for empty rules', () => {
    expect(isWindowCoveredByRules([], mondayAt(10), mondayAt(12))).toBe(false);
  });

  it('covers booking fully inside Mon 9–17', () => {
    const rules = [rule(1, '09:00', '17:00')];
    expect(isWindowCoveredByRules(rules, mondayAt(10), mondayAt(12))).toBe(true);
  });

  it('rejects booking starting before rule open', () => {
    const rules = [rule(1, '09:00', '17:00')];
    expect(isWindowCoveredByRules(rules, mondayAt(8), mondayAt(10))).toBe(false);
  });

  it('rejects booking ending after rule close', () => {
    const rules = [rule(1, '09:00', '17:00')];
    expect(isWindowCoveredByRules(rules, mondayAt(16), mondayAt(18))).toBe(false);
  });

  it('rejects gap between two same-day rules', () => {
    const rules = [rule(1, '09:00', '12:00'), rule(1, '13:00', '17:00')];
    expect(isWindowCoveredByRules(rules, mondayAt(9), mondayAt(17))).toBe(false);
  });

  it('covers union of two same-day rules', () => {
    const rules = [rule(1, '09:00', '12:00'), rule(1, '13:00', '17:00')];
    expect(isWindowCoveredByRules(rules, mondayAt(9), mondayAt(12))).toBe(true);
    expect(isWindowCoveredByRules(rules, mondayAt(13), mondayAt(17))).toBe(true);
  });

  it('rejects booking crossing into Tuesday without Tuesday rule', () => {
    const rules = [rule(1, '09:00', '17:00')];
    expect(isWindowCoveredByRules(rules, mondayAt(16), tuesdayAt(10))).toBe(false);
  });

  it('covers overnight rule Mon 22:00–06:00 for late-night booking', () => {
    const rules = [rule(1, '22:00', '06:00')];
    expect(isWindowCoveredByRules(rules, mondayAt(23), tuesdayAt(5))).toBe(true);
  });

  it('handles Postgres-style time strings with seconds', () => {
    const rules: AvailabilityRuleRow[] = [
      {
        parkingSpotId: 's',
        dayOfWeek: 1,
        startTime: '09:00:00',
        endTime: '17:00:00',
        timezone: TZ,
      },
    ];
    expect(isWindowCoveredByRules(rules, mondayAt(10), mondayAt(12))).toBe(true);
  });

  it('does not crash on DST spring-forward day', () => {
    // 2025-03-09 spring forward in America/Toronto
    const rules = [rule(0, '00:00', '23:59')];
    const start = DateTime.fromObject(
      { year: 2025, month: 3, day: 9, hour: 10 },
      { zone: TZ },
    )
      .toUTC()
      .toJSDate();
    const end = DateTime.fromObject(
      { year: 2025, month: 3, day: 9, hour: 14 },
      { zone: TZ },
    )
      .toUTC()
      .toJSDate();
    expect(isWindowCoveredByRules(rules, start, end)).toBe(true);
  });
});
