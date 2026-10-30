import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript run by GitHub Actions
import { plain, toRemind } from "../.github/reminders/send.mjs";

describe("reminder sender", () => {
  const now = new Date("2026-10-30T16:10:00Z"); // 9:10 in Los Angeles, 1:10 next day in Tokyo
  const push = {
    hour: 9,
    due: [now.getTime() - 1000, now.getTime() - 5000, now.getTime() + 86_400_000],
    devices: {
      la: { token: "t1", tz: "America/Los_Angeles" },
      tokyo: { token: "t2", tz: "Asia/Tokyo" },
      done: { token: "t3", tz: "America/Los_Angeles", sent: "2026-10-30" },
    },
  };

  it("reminds devices at their hour, once a day, when reviews are waiting", () => {
    expect(toRemind(push, now)).toEqual([["la", "t1", "2026-10-30", 2]]);
    expect(toRemind({ ...push, due: [now.getTime() + 1000] }, now)).toEqual([]);
    expect(toRemind({ ...push, hour: null }, now)).toEqual([]);
  });

  it("takes minutes into account", () => {
    expect(toRemind({ ...push, hour: 9.25 }, now)).toEqual([]); // 9:15, and it's 9:10 in Los Angeles
    expect(toRemind({ ...push, hour: 9 + 10 / 60 }, now)).toEqual([["la", "t1", "2026-10-30", 2]]);
    expect(toRemind({ ...push, hour: 6.25 }, now)).toEqual([["la", "t1", "2026-10-30", 2]]); // 6:15, within 3 hours
    expect(toRemind({ ...push, hour: 6 }, now)).toEqual([]); // 3 h 10 min ago
  });

  it("reads Firestore's typed values", () => {
    expect(
      plain({
        mapValue: {
          fields: {
            hour: { integerValue: "9" },
            due: { arrayValue: { values: [{ integerValue: "5" }, { doubleValue: 6.5 }] } },
            devices: { mapValue: { fields: { d1: { mapValue: { fields: { tz: { stringValue: "UTC" } } } } } } },
            x: { nullValue: null },
          },
        },
      }),
    ).toEqual({ hour: 9, due: [5, 6.5], devices: { d1: { tz: "UTC" } }, x: null });
  });
});
