import type * as React from "react";

import { Input } from "#/components/ui/input.tsx";

type MoneyInputProps = Omit<
	React.ComponentProps<typeof Input>,
	"inputMode" | "onChange" | "type" | "value"
> & {
	onValueChange: (value: string) => void;
	value: string;
};

function formatDigitsAsMoney(digits: string) {
	if (!digits) return "0,00";
	const paddedDigits = digits.padStart(3, "0");
	const integer = paddedDigits.slice(0, -2).replace(/^0+(?=\d)/, "");
	const cents = paddedDigits.slice(-2);
	return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}

function formatMoneyInputFromCents(cents: number) {
	return formatDigitsAsMoney(String(cents));
}

function moneyInputToCents(value: string) {
	if (!/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(value)) return Number.NaN;
	return Number(value.replace(/[.,]/g, ""));
}

function MoneyInput({ onValueChange, value, ...props }: MoneyInputProps) {
	return (
		<Input
			{...props}
			inputMode="numeric"
			type="text"
			value={value}
			onChange={(event) =>
				onValueChange(
					formatDigitsAsMoney(event.currentTarget.value.replace(/\D/g, "")),
				)
			}
		/>
	);
}

export { formatMoneyInputFromCents, MoneyInput, moneyInputToCents };
