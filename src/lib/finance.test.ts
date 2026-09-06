import { describe, expect, it } from "vitest";

import {
	addCivilDays,
	CATEGORY_ICONS,
	civilMonthFor,
	currentSaoPauloMonth,
	inclusivePeriodToTechnical,
	invoiceCycleFor,
	invoiceCycleForReferenceMonth,
	isCivilDate,
	normalizeCategoryName,
	periodFor,
	safeMoneyCents,
	shiftReferenceMonth,
	splitInstallmentAmounts,
	sumMoneyCents,
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

	it("rejects malformed or impossible dates as invalid", () => {
		expect(isCivilDate("2023-02-29")).toBe(false);
		expect(isCivilDate("0400-02-29")).toBe(true);
		expect(isCivilDate("2024-13-01")).toBe(false);
		expect(isCivilDate("2024-00-10")).toBe(false);
		expect(isCivilDate("2024-01-00")).toBe(false);
		expect(isCivilDate("2024-1-01")).toBe(false);
		expect(isCivilDate("2024-01-011")).toBe(false);
		expect(isCivilDate("20240101")).toBe(false);
		expect(isCivilDate("24-01-01")).toBe(false);
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

	it("converts inclusive dashboard periods to an exclusive technical end", () => {
		expect(
			inclusivePeriodToTechnical({
				startDate: "2024-02-29",
				endDate: "2024-02-29",
			}),
		).toEqual({ startDate: "2024-02-29", endDate: "2024-03-01" });
		expect(
			inclusivePeriodToTechnical({
				startDate: "2024-12-20",
				endDate: "2024-12-31",
			}),
		).toEqual({ startDate: "2024-12-20", endDate: "2025-01-01" });
		expect(
			inclusivePeriodToTechnical({
				startDate: "2024-03-01",
				endDate: "2024-02-29",
			}),
		).toBeNull();
		expect(
			inclusivePeriodToTechnical({
				startDate: "2024-02-30",
				endDate: "2024-03-01",
			}),
		).toBeNull();
		expect(
			inclusivePeriodToTechnical({
				startDate: "9999-12-31",
				endDate: "9999-12-31",
			}),
		).toBeNull();
	});

	it("selects complete civil months across leap years and year boundaries", () => {
		expect(civilMonthFor("2024-02-10")).toEqual({
			startDate: "2024-02-01",
			endDate: "2024-02-29",
		});
		expect(civilMonthFor("2024-12-31")).toEqual({
			startDate: "2024-12-01",
			endDate: "2024-12-31",
		});
		expect(addCivilDays("2024-12-31", 1)).toBe("2025-01-01");
		expect(addCivilDays("2024-02-29", -1)).toBe("2024-02-28");
		// 2026-07-01T01:00:00Z is still 2026-06-30 in São Paulo (UTC-3)
		expect(currentSaoPauloMonth(new Date("2026-07-01T01:00:00.000Z"))).toEqual({
			startDate: "2026-06-01",
			endDate: "2026-06-30",
		});
	});

	it("uses São Paulo civil time for the initial dashboard month", () => {
		expect(currentSaoPauloMonth(new Date("2026-03-01T01:30:00.000Z"))).toEqual({
			startDate: "2026-02-01",
			endDate: "2026-02-28",
		});
	});

	it("maps purchases and reference months across closing boundaries", () => {
		expect(invoiceCycleFor("2024-06-25", 25, 5)).toEqual({
			closingDate: "2024-06-25",
			dueDate: "2024-07-05",
		});
		expect(invoiceCycleFor("2024-06-26", 25, 5)).toEqual({
			closingDate: "2024-07-25",
			dueDate: "2024-08-05",
		});
		expect(invoiceCycleForReferenceMonth("2024-07", 31, 5)).toEqual({
			closingDate: "2024-06-30",
			dueDate: "2024-07-05",
		});
		expect(shiftReferenceMonth("2024-12", 1)).toBe("2025-01");
	});

	it("throws on invalid civil dates and month references", () => {
		expect(() => invoiceCycleFor("2024-02-30", 5, 10)).toThrow(
			"Data civil inválida.",
		);
		expect(() => shiftReferenceMonth("2024-13", 1)).toThrow(
			"Mês de referência inválido.",
		);
		expect(() => shiftReferenceMonth("2024-00", 1)).toThrow(
			"Mês de referência inválido.",
		);
		expect(() => shiftReferenceMonth("2024-1", 1)).toThrow(
			"Mês de referência inválido.",
		);
		expect(() => invoiceCycleForReferenceMonth("2024-13", 5, 10)).toThrow(
			"Mês de referência inválido.",
		);
		expect(() => invoiceCycleForReferenceMonth("2024-00", 5, 10)).toThrow(
			"Mês de referência inválido.",
		);
		expect(() =>
			invoiceCycleForReferenceMonth("1.5e2" as string, 5, 10),
		).toThrow("Mês de referência inválido.");
		expect(() => civilMonthFor("2024-02-30")).toThrow("Data civil inválida.");
		expect(() => addCivilDays("2024-13-01", 1)).toThrow("Data civil inválida.");
		expect(() => periodFor("day", "2024-06-31")).toThrow(
			"Data civil inválida.",
		);
	});

	it("shifts month references across year boundaries and negative steps", () => {
		expect(shiftReferenceMonth("2025-01", -1)).toBe("2024-12");
		expect(shiftReferenceMonth("2024-06", -6)).toBe("2023-12");
		expect(shiftReferenceMonth("2024-06", 0)).toBe("2024-06");
		expect(shiftReferenceMonth("2024-08", 6)).toBe("2025-02");
	});

	it("clamps cycle dates to the end of shorter months", () => {
		// closingDay 31 falls on Feb 28 in a non-leap year; the due day
		// would land before the closing, so it is pushed to the next March
		expect(invoiceCycleFor("2023-02-05", 31, 5)).toEqual({
			closingDate: "2023-02-28",
			dueDate: "2023-03-05",
		});
		// closingDay 31 stays at Feb 29 in a leap year
		expect(invoiceCycleFor("2024-02-05", 31, 5)).toEqual({
			closingDate: "2024-02-29",
			dueDate: "2024-03-05",
		});
	});

	it("moves the due date to the next month when it does not fall after the closing", () => {
		expect(invoiceCycleFor("2025-06-20", 25, 5)).toEqual({
			closingDate: "2025-06-25",
			dueDate: "2025-07-05",
		});
		// dueDay === closingDay: due must still be after closing
		expect(invoiceCycleFor("2025-07-01", 10, 10)).toEqual({
			closingDate: "2025-07-10",
			dueDate: "2025-08-10",
		});
		// closing clamped to last day, due falls in the next shorter month
		expect(invoiceCycleFor("2025-08-01", 31, 30)).toEqual({
			closingDate: "2025-08-31",
			dueDate: "2025-09-30",
		});
	});

	it("anchors reference-month cycles to the previous month when due precedes closing", () => {
		expect(invoiceCycleForReferenceMonth("2024-03", 10, 5)).toEqual({
			closingDate: "2024-02-10",
			dueDate: "2024-03-05",
		});
		expect(invoiceCycleForReferenceMonth("2024-01", 10, 10)).toEqual({
			closingDate: "2023-12-10",
			dueDate: "2024-01-10",
		});
		// due (day 1) precedes closing (day 30): closing anchors to January
		expect(invoiceCycleForReferenceMonth("2024-02", 30, 1)).toEqual({
			closingDate: "2024-01-30",
			dueDate: "2024-02-01",
		});
		// closing day 31 clamps to January's 31 days
		expect(invoiceCycleForReferenceMonth("2024-02", 31, 15)).toEqual({
			closingDate: "2024-01-31",
			dueDate: "2024-02-15",
		});
	});

	it("places indivisible cents in the final installment", () => {
		expect(splitInstallmentAmounts(1000, 3)).toEqual([333, 333, 334]);
		expect(() => splitInstallmentAmounts(2, 3)).toThrow(
			"Parcelamento inválido.",
		);
	});

	it("sums money with bigint intermediates and rejects unsafe DTO totals", () => {
		expect(sumMoneyCents([Number.MAX_SAFE_INTEGER - 10, 10])).toBe(
			Number.MAX_SAFE_INTEGER,
		);
		expect(() => sumMoneyCents([Number.MAX_SAFE_INTEGER, 1])).toThrowError(
			"Total financeiro excede o limite seguro.",
		);
		expect(() =>
			safeMoneyCents(BigInt(Number.MIN_SAFE_INTEGER) - 1n),
		).toThrowError("Total financeiro excede o limite seguro.");
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
