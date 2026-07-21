import {
	BadgeDollarSign,
	Banknote,
	Bitcoin,
	BookOpen,
	BriefcaseBusiness,
	Building2,
	Bus,
	Car,
	CircleDollarSign,
	CircleEllipsis,
	Coffee,
	CreditCard,
	Dog,
	Dumbbell,
	Gamepad2,
	Gift,
	GraduationCap,
	HeartPulse,
	House,
	Landmark,
	Music,
	PiggyBank,
	Plane,
	QrCode,
	ReceiptText,
	Shirt,
	ShoppingBag,
	Smartphone,
	Tags,
	TrendingUp,
	Utensils,
	WalletCards,
} from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "#/lib/utils.ts";

export const categoryIcons: Record<
	string,
	ComponentType<{ className?: string }>
> = {
	BadgeDollarSign,
	Banknote,
	BriefcaseBusiness,
	Bitcoin,
	BookOpen,
	Building2,
	Bus,
	Car,
	CircleDollarSign,
	CircleEllipsis,
	Coffee,
	CreditCard,
	Dog,
	Dumbbell,
	Gamepad2,
	GraduationCap,
	Gift,
	HeartPulse,
	House,
	Landmark,
	Music,
	PiggyBank,
	Plane,
	QrCode,
	ReceiptText,
	Shirt,
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
	lime: "bg-lime-500",
	orange: "bg-orange-500",
	pink: "bg-pink-500",
	red: "bg-red-500",
	rose: "bg-rose-500",
	sky: "bg-sky-500",
	slate: "bg-slate-500",
	teal: "bg-teal-500",
	violet: "bg-violet-500",
	fuchsia: "bg-fuchsia-500",
};

export function CategoryMark({
	colorKey,
	iconKey,
	className,
	iconClassName,
}: {
	colorKey: string;
	iconKey: string;
	className?: string;
	iconClassName?: string;
}) {
	const Icon = categoryIcons[iconKey] ?? Tags;

	return (
		<span
			className={cn(
				"inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-white",
				colorClasses[colorKey] ?? "bg-slate-500",
				className,
			)}
		>
			<Icon className={cn("size-4", iconClassName)} />
		</span>
	);
}
