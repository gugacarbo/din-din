import { describe, expect, it } from "vitest";

import { isCivilDate, normalizeCategoryName, periodFor } from "./finance.ts";

describe("finance helpers", () => {
	it("normalizes accents and repeated spaces for category uniqueness", () => {
		expect(normalizeCategoryName("  Alimentação   básica ")).toBe(
			"alimentacao basica",
		);
	});

	it("accepts only real civil dates", () => {
		expect(isCivilDate("2026-02-28")).toBe(true);
		expect(isCivilDate("2026-02-30")).toBe(false);
	});

	it("calculates Monday-to-Sunday weeks and calendar months", () => {
		expect(periodFor("week", "2026-07-17")).toEqual({
			startDate: "2026-07-13",
			endDate: "2026-07-19",
		});
		expect(periodFor("month", "2024-02-10")).toEqual({
			startDate: "2024-02-01",
			endDate: "2024-02-29",
		});
	});
});
