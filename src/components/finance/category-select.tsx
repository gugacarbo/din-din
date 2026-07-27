import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { cn } from "#/lib/utils.ts";
import type { CategoryDto } from "#/server/finance.ts";

import { CategoryMark } from "./presentation.tsx";

type RootOption = {
	value: string;
	label: string;
};

export function CategorySelect({
	categories,
	value,
	onValueChange,
	id,
	className,
	disabled,
	placeholder = "Selecione uma categoria",
	rootOption,
	"aria-describedby": ariaDescribedBy,
	"aria-invalid": ariaInvalid,
}: {
	categories: CategoryDto[];
	value: string;
	onValueChange: (value: string) => void;
	id?: string;
	className?: string;
	disabled?: boolean;
	placeholder?: string;
	rootOption?: RootOption;
	"aria-describedby"?: string;
	"aria-invalid"?: boolean;
}) {
	const selectedCategory = categories.find((category) => category.id === value);
	const selectedRootOption =
		rootOption?.value === value ? rootOption : undefined;

	return (
		<Select
			disabled={disabled}
			onValueChange={(nextValue) => {
				if (nextValue !== null) onValueChange(nextValue);
			}}
			value={value}
		>
			<SelectTrigger
				aria-describedby={ariaDescribedBy}
				aria-invalid={ariaInvalid}
				className={cn("w-full", className)}
				id={id}
			>
				{selectedCategory ? (
					<span className="flex min-w-0 items-center gap-2">
						<CategoryMark
							className="size-6 rounded-lg"
							colorKey={selectedCategory.colorKey}
							iconClassName="size-4"
							iconKey={selectedCategory.iconKey}
							variant="icon"
						/>
						<span className="truncate">
							{"— ".repeat(selectedCategory.level - 1)}
							{selectedCategory.name}
							{selectedCategory.archivedAt ? " (Arquivada)" : ""}
						</span>
					</span>
				) : selectedRootOption ? (
					<span className="truncate">{selectedRootOption.label}</span>
				) : (
					<SelectValue placeholder={placeholder} />
				)}
			</SelectTrigger>
			<SelectContent>
				{rootOption && (
					<SelectItem value={rootOption.value}>{rootOption.label}</SelectItem>
				)}
				{categories.map((category) => (
					<SelectItem key={category.id} value={category.id}>
						<span className="flex min-w-0 items-center gap-2">
							<CategoryMark
								className="size-6"
								colorKey={category.colorKey}
								iconClassName="size-4"
								iconKey={category.iconKey}
								variant="icon"
							/>
							<span className="truncate">
								{"— ".repeat(category.level - 1)}
								{category.name}
								{category.archivedAt ? " (Arquivada)" : ""}
							</span>
						</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
