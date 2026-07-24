import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { cn } from "#/lib/utils.ts";
import type { PaymentMethodDto } from "#/server/finance.ts";

import { CategoryMark } from "./presentation.tsx";

type EmptyOption = { label: string; value: string };

export function PaymentMethodSelect({
	methods,
	value,
	onValueChange,
	id,
	className,
	disabled,
	placeholder = "Escolha uma forma de pagamento",
	emptyOption,
	"aria-describedby": ariaDescribedBy,
	"aria-invalid": ariaInvalid,
}: {
	methods: PaymentMethodDto[];
	value: string;
	onValueChange: (value: string) => void;
	id?: string;
	className?: string;
	disabled?: boolean;
	placeholder?: string;
	emptyOption?: EmptyOption;
	"aria-describedby"?: string;
	"aria-invalid"?: boolean;
}) {
	const selectedMethod = methods.find((method) => method.id === value);
	const selectedEmptyOption =
		emptyOption?.value === value ? emptyOption : undefined;

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
				{selectedMethod ? (
					<span className="flex min-w-0 items-center gap-2">
						<CategoryMark
							className="size-6"
							colorKey={selectedMethod.colorKey}
							iconClassName="size-4"
							iconKey={selectedMethod.iconKey}
							variant="icon"
						/>
						<span className="truncate">
							{selectedMethod.name}
							{selectedMethod.archivedAt ? " (arquivada)" : ""}
						</span>
					</span>
				) : selectedEmptyOption ? (
					<span className="text-muted-foreground">
						{selectedEmptyOption.label}
					</span>
				) : (
					<SelectValue placeholder={placeholder} />
				)}
			</SelectTrigger>
			<SelectContent>
				{emptyOption && (
					<SelectItem value={emptyOption.value}>{emptyOption.label}</SelectItem>
				)}
				{methods.map((method) => (
					<SelectItem key={method.id} value={method.id}>
						<span className="flex min-w-0 items-center gap-2">
							<CategoryMark
								className="size-6"
								colorKey={method.colorKey}
								iconClassName="size-4"
								iconKey={method.iconKey}
								variant="icon"
							/>
							<span className="truncate">
								{method.name}
								{method.archivedAt ? " (arquivada)" : ""}
							</span>
						</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
