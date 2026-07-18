import {
	Banknote,
	BriefcaseBusiness,
	Car,
	CircleDollarSign,
	Dumbbell,
	Gamepad2,
	Gift,
	GraduationCap,
	HeartPulse,
	House,
	PiggyBank,
	Plane,
	ReceiptText,
	ShoppingBag,
	Smartphone,
	Tags,
	TrendingUp,
	Utensils,
	WalletCards,
} from "lucide-react";
import type { ComponentType } from "react";

const categoryIcons: Record<string, ComponentType<{ className?: string }>> = {
	Banknote,
	BriefcaseBusiness,
	Car,
	CircleDollarSign,
	Dumbbell,
	Gamepad2,
	GraduationCap,
	Gift,
	HeartPulse,
	House,
	PiggyBank,
	Plane,
	ReceiptText,
	ShoppingBag,
	Smartphone,
	Tags,
	TrendingUp,
	Utensils,
	WalletCards,
};

const colorClasses: Record<string, string> = {
	amber: "bg-amber-400",
	blue: "bg-blue-500",
	cyan: "bg-cyan-500",
	emerald: "bg-emerald-500",
	indigo: "bg-indigo-500",
	orange: "bg-orange-500",
	pink: "bg-pink-500",
	rose: "bg-rose-500",
	teal: "bg-teal-500",
	violet: "bg-violet-500",
};

export function CategoryMark({
	colorKey,
	iconKey,
}: {
	colorKey: string;
	iconKey: string;
}) {
	const Icon = categoryIcons[iconKey] ?? Tags;

	return (
		<span
			className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-white ${colorClasses[colorKey] ?? "bg-slate-500"}`}
		>
			<Icon className="size-4" />
		</span>
	);
}
