import { describe, expect, it } from "bun:test";
import { resolveRelativeTime, resolveParamsTime } from "./time-resolver";

// Fixed reference time: 2024-06-15 14:30:00 UTC (Saturday)
const NOW = new Date("2024-06-15T14:30:00.000Z");

describe("resolveRelativeTime", () => {
  describe("passthrough", () => {
    it("returns ISO date string as-is", () => {
      expect(resolveRelativeTime("2024-06-15T10:00:00.000Z", "UTC", NOW)).toBe(
        "2024-06-15T10:00:00.000Z"
      );
    });

    it("returns date-only string as-is", () => {
      expect(resolveRelativeTime("2024-06-15", "UTC", NOW)).toBe("2024-06-15");
    });

    it("returns unrecognized token as-is", () => {
      expect(resolveRelativeTime("some random text", "UTC", NOW)).toBe("some random text");
    });
  });

  describe("NOW token", () => {
    it("resolves NOW to current UTC time", () => {
      const result = resolveRelativeTime("NOW", "UTC", NOW);
      expect(result).toBe("2024-06-15T14:30:00.000Z");
    });
  });

  describe("TODAY token", () => {
    it("resolves TODAY to start of today in UTC", () => {
      const result = resolveRelativeTime("TODAY", "UTC", NOW);
      expect(new Date(result).getUTCHours()).toBe(0);
      expect(new Date(result).getUTCDate()).toBe(15);
    });

    it("resolves TODAY_15:00 to 3pm today in UTC", () => {
      const result = resolveRelativeTime("TODAY_15:00", "UTC", NOW);
      const date = new Date(result);
      expect(date.getUTCHours()).toBe(15);
      expect(date.getUTCMinutes()).toBe(0);
      expect(date.getUTCDate()).toBe(15);
    });

    it("resolves TODAY_9:30 in Asia/Kolkata correctly", () => {
      // IST is UTC+5:30. 9:30 IST = 4:00 UTC
      const result = resolveRelativeTime("TODAY_9:30", "Asia/Kolkata", NOW);
      const date = new Date(result);
      expect(date.getUTCHours()).toBe(4);
      expect(date.getUTCMinutes()).toBe(0);
    });
  });

  describe("TOMORROW token", () => {
    it("resolves TOMORROW to start of tomorrow in UTC", () => {
      const result = resolveRelativeTime("TOMORROW", "UTC", NOW);
      const date = new Date(result);
      expect(date.getUTCDate()).toBe(16);
      expect(date.getUTCHours()).toBe(0);
    });

    it("resolves TOMORROW_14:00 to 2pm tomorrow in UTC", () => {
      const result = resolveRelativeTime("TOMORROW_14:00", "UTC", NOW);
      const date = new Date(result);
      expect(date.getUTCDate()).toBe(16);
      expect(date.getUTCHours()).toBe(14);
      expect(date.getUTCMinutes()).toBe(0);
    });

    it("handles timezone correctly for TOMORROW_10:00 in America/New_York", () => {
      // EDT is UTC-4. 10:00 EDT = 14:00 UTC
      const result = resolveRelativeTime("TOMORROW_10:00", "America/New_York", NOW);
      const date = new Date(result);
      expect(date.getUTCHours()).toBe(14);
      expect(date.getUTCMinutes()).toBe(0);
    });
  });

  describe("YESTERDAY token", () => {
    it("resolves YESTERDAY to start of yesterday in UTC", () => {
      const result = resolveRelativeTime("YESTERDAY", "UTC", NOW);
      const date = new Date(result);
      expect(date.getUTCDate()).toBe(14);
      expect(date.getUTCHours()).toBe(0);
    });

    it("resolves YESTERDAY_16:00 to 4pm yesterday in UTC", () => {
      const result = resolveRelativeTime("YESTERDAY_16:00", "UTC", NOW);
      const date = new Date(result);
      expect(date.getUTCDate()).toBe(14);
      expect(date.getUTCHours()).toBe(16);
    });
  });

  describe("NEXT_WEEK token", () => {
    it("resolves NEXT_WEEK to next Monday at 9am by default", () => {
      // June 15, 2024 is Saturday → next Monday = June 17
      const result = resolveRelativeTime("NEXT_WEEK", "UTC", NOW);
      const date = new Date(result);
      expect(date.getUTCDate()).toBe(17);
      expect(date.getUTCHours()).toBe(9);
    });

    it("resolves NEXT_WEEK_14:00 to next Monday at 2pm", () => {
      const result = resolveRelativeTime("NEXT_WEEK_14:00", "UTC", NOW);
      const date = new Date(result);
      expect(date.getUTCDate()).toBe(17);
      expect(date.getUTCHours()).toBe(14);
    });
  });

  describe("relative day offsets", () => {
    it("resolves +1d to tomorrow", () => {
      const result = resolveRelativeTime("+1d", "UTC", NOW);
      const date = new Date(result);
      expect(date.getUTCDate()).toBe(16);
    });

    it("resolves +3d_10:00 to 3 days from now at 10am", () => {
      const result = resolveRelativeTime("+3d_10:00", "UTC", NOW);
      const date = new Date(result);
      expect(date.getUTCDate()).toBe(18);
      expect(date.getUTCHours()).toBe(10);
    });

    it("resolves -1d to yesterday", () => {
      const result = resolveRelativeTime("-1d", "UTC", NOW);
      const date = new Date(result);
      expect(date.getUTCDate()).toBe(14);
    });

    it("resolves -2d_18:00 to 2 days ago at 6pm", () => {
      const result = resolveRelativeTime("-2d_18:00", "UTC", NOW);
      const date = new Date(result);
      expect(date.getUTCDate()).toBe(13);
      expect(date.getUTCHours()).toBe(18);
    });
  });
});

describe("resolveParamsTime", () => {
  it("resolves time fields in params", () => {
    const params = {
      medium: "PHONE_CALL",
      content: "Budget discussion",
      happenedAt: "NOW",
      followUpAt: "TOMORROW_10:00",
    };
    const resolved = resolveParamsTime(params, "UTC", NOW);

    expect(resolved.medium).toBe("PHONE_CALL");
    expect(resolved.content).toBe("Budget discussion");
    expect(resolved.happenedAt).toBe("2024-06-15T14:30:00.000Z");
    expect(new Date(resolved.followUpAt as string).getUTCDate()).toBe(16);
    expect(new Date(resolved.followUpAt as string).getUTCHours()).toBe(10);
  });

  it("does not resolve non-time fields", () => {
    const params = {
      displayName: "NOW",
      company: "TOMORROW Inc",
      happenedAt: "NOW",
    };
    const resolved = resolveParamsTime(params, "UTC", NOW);

    expect(resolved.displayName).toBe("NOW");
    expect(resolved.company).toBe("TOMORROW Inc");
    expect(resolved.happenedAt).toBe("2024-06-15T14:30:00.000Z");
  });

  it("passes through ISO dates in time fields", () => {
    const params = { startAt: "2024-07-01T10:00:00Z" };
    const resolved = resolveParamsTime(params, "UTC", NOW);
    expect(resolved.startAt).toBe("2024-07-01T10:00:00Z");
  });

  it("handles snake_case time field names", () => {
    const params = {
      start_at: "TOMORROW_9:00",
      end_at: "TOMORROW_17:00",
      due_at: "+3d_10:00",
    };
    const resolved = resolveParamsTime(params, "UTC", NOW);

    expect(new Date(resolved.start_at as string).getUTCHours()).toBe(9);
    expect(new Date(resolved.end_at as string).getUTCHours()).toBe(17);
    expect(new Date(resolved.due_at as string).getUTCDate()).toBe(18);
  });
});
