import { TrendingDown, TrendingUp } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { cn } from "#/lib/utils.ts";

export type Kind = "income" | "expense";

const kindIcons: Record<Kind, typeof TrendingUp> = {
	income: TrendingUp,
	expense: TrendingDown,
};

const kindLabels: Record<Kind, string> = {
	income: "Receita",
	expense: "Despesa",
};

export function KindSelect({
	value,
	onValueChange,
	id,
	className,
	disabled,
	"aria-describedby": ariaDescribedBy,
	"aria-invalid": ariaInvalid,
}: {
	value?: Kind;
	onValueChange: (value: Kind) => void;
	id?: string;
	className?: string;
	disabled?: boolean;
	"aria-describedby"?: string;
	"aria-invalid"?: boolean;
}) {
	return (
		<Select disabled={disabled} onValueChange={onValueChange} value={value}>
			<SelectTrigger
				aria-describedby={ariaDescribedBy}
				aria-invalid={ariaInvalid}
				className={cn("w-full", className)}
				id={id}
			>
				<SelectValue placeholder="Selecione o tipo" />
			</SelectTrigger>
			<SelectContent>
				{(Object.keys(kindLabels) as Kind[]).map((kind) => {
					const Icon = kindIcons[kind];
					return (
						<SelectItem key={kind} value={kind}>
							<span className="flex items-center gap-2">
								<Icon
									aria-hidden
									className={cn(
										"size-4 shrink-0",
										kind === "income"
											? "text-emerald-600 dark:text-emerald-400"
											: "text-destructive",
									)}
								/>
								<span>{kindLabels[kind]}</span>
							</span>
						</SelectItem>
					);
				})}
			</SelectContent>
		</Select>
	);
}
