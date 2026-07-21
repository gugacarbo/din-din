import { describe, expect, it } from "vitest";

import {
	CATEGORY_ICONS,
	isCivilDate,
	normalizeCategoryName,
	periodFor,
} from "./finance.ts";

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

	it("calculates civil periods with an exclusive end date", () => {
		expect(periodFor("day", "2024-02-29")).toEqual({
			startDate: "2024-02-29",
			endDate: "2024-03-01",
		});
		expect(periodFor("week", "2026-07-17")).toEqual({
			startDate: "2026-07-13",
			endDate: "2026-07-20",
		});
		expect(periodFor("month", "2024-02-10")).toEqual({
			startDate: "2024-02-01",
			endDate: "2024-03-01",
		});
		expect(periodFor("month", "2024-12-10")).toEqual({
			startDate: "2024-12-01",
			endDate: "2025-01-01",
		});
	});

	it("includes several animal icons among the choices available to categories and payments", () => {
		expect(CATEGORY_ICONS).toEqual(
			expect.arrayContaining([
				"Cat",
				"CatFace",
				"CatSitting",
				"CatPlay",
				"Bird",
				"Fish",
				"Rabbit",
				"Turtle",
			]),
		);
	});
});
