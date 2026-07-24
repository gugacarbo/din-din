export const CATEGORY_COLORS = [
	"emerald",
	"cyan",
	"violet",
	"blue",
	"orange",
	"amber",
	"rose",
	"teal",
	"indigo",
	"pink",
	"lime",
	"red",
	"sky",
	"fuchsia",
	"slate",
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
	"Banknote",
	"Dumbbell",
	"PiggyBank",
	"Plane",
	"ReceiptText",
	"Smartphone",
	"TrendingUp",
	"Coffee",
	"Shirt",
	"BookOpen",
	"Dog",
	"Bus",
	"Music",
	"CreditCard",
	"Landmark",
	"QrCode",
	"Building2",
	"BadgeDollarSign",
	"Bitcoin",
	"CircleEllipsis",
	"Baby",
	"Bike",
	"Calculator",
	"Camera",
	"Cat",
	"CirclePlay",
	"ClipboardList",
	"Fuel",
	"Hotel",
	"PawPrint",
	"ShoppingCart",
	"Stethoscope",
	"Ticket",
	"Tv",
	"Wrench",
	"Bird",
	"Fish",
	"Rabbit",
	"Turtle",
	"Flower2",
	"Trees",
	"ChefHat",
	"Bath",
	"Umbrella",
	"BaggageClaim",
	"Pill",
	"Syringe",
	"Laptop",
	"Package",
	"CatFace",
	"CatSitting",
	"CatPlay",
] as const;

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

function monthDate(year: number, month: number, day: number) {
	const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, amount: number) {
	const date = new Date(Date.UTC(year, month - 1 + amount, 1));
	return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function shiftReferenceMonth(value: string, amount: number) {
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
		throw new Error("Mês de referência inválido.");
	const [year, month] = value.split("-").map(Number);
	const shifted = shiftMonth(year, month, amount);
	return `${shifted.year}-${String(shifted.month).padStart(2, "0")}`;
}

export function invoiceCycleFor(
	occurredAt: string,
	closingDay: number,
	dueDay: number,
) {
	if (!isCivilDate(occurredAt)) throw new Error("Data civil inválida.");
	const [year, month] = occurredAt.split("-").map(Number);
	const currentClosing = monthDate(year, month, closingDay);
	const closing =
		occurredAt <= currentClosing
			? currentClosing
			: (() => {
					const next = shiftMonth(year, month, 1);
					return monthDate(next.year, next.month, closingDay);
				})();
	const [closingYear, closingMonth] = closing.split("-").map(Number);
	let due = monthDate(closingYear, closingMonth, dueDay);
	if (due <= closing) {
		const next = shiftMonth(closingYear, closingMonth, 1);
		due = monthDate(next.year, next.month, dueDay);
	}
	return { closingDate: closing, dueDate: due };
}

export function invoiceCycleForReferenceMonth(
	referenceMonth: string,
	closingDay: number,
	dueDay: number,
) {
	const [year, month] = referenceMonth.split("-").map(Number);
	if (
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		month < 1 ||
		month > 12
	)
		throw new Error("Mês de referência inválido.");
	const closingMonth =
		dueDay <= closingDay ? shiftMonth(year, month, -1) : { year, month };
	return {
		closingDate: monthDate(closingMonth.year, closingMonth.month, closingDay),
		dueDate: monthDate(year, month, dueDay),
	};
}

export function splitInstallmentAmounts(
	totalAmountCents: number,
	installmentCount: number,
) {
	if (
		!Number.isSafeInteger(totalAmountCents) ||
		totalAmountCents <= 0 ||
		!Number.isInteger(installmentCount) ||
		installmentCount < 1 ||
		installmentCount > 36 ||
		totalAmountCents < installmentCount
	)
		throw new Error("Parcelamento inválido.");
	const base = Math.floor(totalAmountCents / installmentCount);
	return Array.from({ length: installmentCount }, (_, index) =>
		index === installmentCount - 1
			? totalAmountCents - base * (installmentCount - 1)
			: base,
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
		return { startDate: anchorDate, endDate: addDays(anchorDate, 1) };
	if (granularity === "month") {
		const [year, month] = anchorDate.split("-").map(Number);
		return {
			startDate: `${year}-${String(month).padStart(2, "0")}-01`,
			endDate: `${year + (month === 12 ? 1 : 0)}-${String(
				month === 12 ? 1 : month + 1,
			).padStart(2, "0")}-01`,
		};
	}
	const [year, month, day] = anchorDate.split("-").map(Number);
	const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	const offsetFromMonday = weekday === 0 ? 6 : weekday - 1;
	const startDate = addDays(anchorDate, -offsetFromMonday);
	return { startDate, endDate: addDays(startDate, 7) };
}

export function saoPauloToday(date = new Date()) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}
