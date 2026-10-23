import { CalendarVietnamese } from "date-chinese";
import { julian } from "astronomia";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

// Build-time astronomy only; no astronomical library enters the app bundle.
// Month numbering follows the Vietnam UTC+7 winter-solstice rules documented in
// docs/lunar-calendar-verification.md. Do NOT use date-chinese's fromJDE/toGregorian
// lunar conversion: it mislabels multiple leap months in 2033.
const MIN_YEAR = 1976;
const MAX_YEAR = 2100;
const calendar = new CalendarVietnamese();
const iso = ({ year, month, day }) =>
  `${year}-${String(month).padStart(2, "0")}-${String(Math.trunc(day)).padStart(2, "0")}`;
// Moon boundaries are UTC+7 civil midnights. Evaluate half a day later to extract
// their Gregorian day without floating-point rounding at the midnight boundary.
const civilDate = (jde) =>
  iso(new julian.CalendarGregorian().fromJDE(jde + 0.5));
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
const byYear = new Map();
let endExclusive;
for (let winterYear = MIN_YEAR - 1; winterYear <= MAX_YEAR; winterYear++) {
  const winterMonth = (year) =>
    calendar.previousNewMoon(calendar.majorSolarTerm(11, year) + 0.5);
  let moon = winterMonth(winterYear);
  const end = winterMonth(winterYear + 1);
  const starts = [];
  while (moon < end - 1) {
    starts.push(moon);
    assert.ok(starts.length <= 13);
    const next = calendar.nextNewMoon(moon + 1);
    assert.ok(next > moon, "Moon boundaries must advance");
    moon = next;
  }
  assert.ok(starts.length === 12 || starts.length === 13);
  const leapIndex =
    starts.length === 13
      ? starts.findIndex(
          (start, index) => index > 0 && calendar.isLeapMonth(start),
        )
      : -1;
  assert.ok(
    starts.length === 12 || leapIndex > 0,
    `A 13-month solstice cycle needs a leap month: ${winterYear} ${starts.map((d) => `${civilDate(d)}:${calendar.isLeapMonth(d)}`).join(", ")}`,
  );
  let month = 10;
  let year = winterYear;
  for (let index = 0; index < starts.length; index++) {
    const isLeapMonth = index === leapIndex;
    if (!isLeapMonth) {
      month = (month % 12) + 1;
      if (month === 1) year++;
    }
    const start = civilDate(starts[index]);
    const nextStart = civilDate(starts[index + 1] ?? end);
    const days = dayNumber(nextStart) - dayNumber(start);
    assert.ok(
      days === 29 || days === 30,
      `Invalid month length ${days} at ${start}`,
    );
    if (year === MAX_YEAR + 1 && month === 1 && !isLeapMonth)
      endExclusive = start;
    if (year < MIN_YEAR || year > MAX_YEAR) continue;
    const months = byYear.get(year) ?? [];
    months.push({ month, isLeapMonth, start, days });
    byYear.set(year, months);
  }
}
const years = [...byYear].map(([year, months]) => ({ year, months }));
assert.equal(years.length, MAX_YEAR - MIN_YEAR + 1);
let previousEnd;
for (const { year, months } of years) {
  assert.deepEqual(
    months.filter((m) => !m.isLeapMonth).map((m) => m.month),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
  assert.ok(months.filter((m) => m.isLeapMonth).length <= 1);
  for (let index = 0; index < months.length; index++) {
    const m = months[index];
    if (previousEnd !== undefined)
      assert.equal(
        dayNumber(m.start),
        previousEnd,
        `Gap at lunar year ${year}`,
      );
    if (m.isLeapMonth) assert.equal(m.month, months[index - 1]?.month);
    previousEnd = dayNumber(m.start) + m.days;
  }
}
assert.equal(previousEnd, dayNumber(endExclusive));
const result = {
  generator:
    "date-chinese@2.1.4 / astronomia@4.2.0 primitives + Mory solstice month numbering",
  source: "https://github.com/commenthol/date-chinese",
  timezone: "Asia/Ho_Chi_Minh",
  minYear: MIN_YEAR,
  maxYear: MAX_YEAR,
  minDate: years[0].months[0].start,
  endExclusive,
  years,
};
const content = `${JSON.stringify(result)}\n`;
const target = new URL(
  "../src/lib/lunar-calendar/generated/vietnamese-years.json",
  import.meta.url,
);
if (process.argv.includes("--check")) {
  assert.equal(
    await readFile(target, "utf8"),
    content,
    "Calendar changed; regenerate and review fixtures before release.",
  );
  console.log(
    `Verified reproducible Vietnamese lunar data (${years.length} years).`,
  );
} else {
  await writeFile(target, content);
  console.log(
    `Generated ${years.length} lunar years, ${Buffer.byteLength(content)} bytes (${result.minDate} ≤ date < ${result.endExclusive}).`,
  );
}
