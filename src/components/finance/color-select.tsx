import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { CATEGORY_COLORS } from "#/lib/finance.ts";
import { cn } from "#/lib/utils.ts";

const colorSwatchClasses: Record<string, string> = {
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

export function colorSwatchClass(colorKey: string): string {
	return colorSwatchClasses[colorKey] ?? "bg-slate-500";
}

export function ColorSelect({
	value,
	onValueChange,
	id,
	className,
}: {
	value: string;
	onValueChange: (value: string) => void;
	id?: string;
	className?: string;
}) {
	return (
		<Select onValueChange={onValueChange} value={value}>
			<SelectTrigger className={cn("w-full", className)} id={id}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{CATEGORY_COLORS.map((color) => (
					<SelectItem key={color} value={color}>
						<span className="flex items-center gap-2">
							<span
								aria-hidden
								className={cn(
									"inline-block size-4 shrink-0 rounded-full",
									colorSwatchClass(color),
								)}
							/>
							<span className="capitalize">{color}</span>
						</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}