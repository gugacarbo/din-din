import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { CATEGORY_ICONS } from "#/lib/finance.ts";
import { cn } from "#/lib/utils.ts";
import { categoryIcons } from "./presentation.tsx";

export function IconSelect({
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
				{CATEGORY_ICONS.map((icon) => {
					const Icon = categoryIcons[icon];
					return (
						<SelectItem key={icon} value={icon}>
							<span className="flex items-center gap-2">
								{Icon ? (
									<Icon
										aria-hidden
										className="size-4 shrink-0 text-muted-foreground"
									/>
								) : null}
								<span>{icon}</span>
							</span>
						</SelectItem>
					);
				})}
			</SelectContent>
		</Select>
	);
}
