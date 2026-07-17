export const CATEGORY_COLORS = [
	"emerald",
	"cyan",
	"violet",
	"blue",
	"orange",
	"amber",
	"rose",
	"teal",
] as const;

export const CATEGORY_ICONS = [
	"BriefcaseBusiness",
	"CircleDollarSign",
	"Gift",
	"House",
	"Utensils",
	"Car",
	"HeartPulse",
	"Gamepad2",
	"Tags",
	"WalletCards",
	"GraduationCap",
	"ShoppingBag",
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export function normalizeCategoryName(value: string) {
	return value
		.trim()
		.replace(/\s+/g, " ")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

export function isCivilDate(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

function addDays(value: string, days: number) {
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day + days));
	return date.toISOString().slice(0, 10);
}

export function periodFor(
	granularity: "day" | "week" | "month",
	anchorDate: string,
) {
	if (!isCivilDate(anchorDate)) throw new Error("Data civil inválida.");
	if (granularity === "day")
		return { startDate: anchorDate, endDate: anchorDate };
	if (granularity === "month") {
		const [year, month] = anchorDate.split("-").map(Number);
		const end = new Date(Date.UTC(year, month, 0)).getUTCDate();
		return {
			startDate: `${year}-${String(month).padStart(2, "0")}-01`,
			endDate: `${year}-${String(month).padStart(2, "0")}-${String(end).padStart(2, "0")}`,
		};
	}
	const [year, month, day] = anchorDate.split("-").map(Number);
	const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	const offsetFromMonday = weekday === 0 ? 6 : weekday - 1;
	const startDate = addDays(anchorDate, -offsetFromMonday);
	return { startDate, endDate: addDays(startDate, 6) };
}

export function saoPauloToday(date = new Date()) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}
