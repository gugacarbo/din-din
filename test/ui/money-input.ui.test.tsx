import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
	formatMoneyInputFromCents,
	MoneyInput,
	moneyInputToCents,
} from "#/components/ui/money-input.tsx";

function ControlledMoneyInput() {
	const [value, setValue] = useState("0,00");
	return <MoneyInput aria-label="Valor" onValueChange={setValue} value={value} />;
}

describe("MoneyInput", () => {
	it("keeps two decimal places while digits are entered", async () => {
		const user = userEvent.setup();
		render(<ControlledMoneyInput />);
		const input = screen.getByLabelText("Valor");

		await user.type(input, "18890");
		expect(input).toHaveValue("188,90");

		await user.clear(input);
		expect(input).toHaveValue("0,00");
		await user.type(input, "33");
		expect(input).toHaveValue("0,33");
	});

	it("uses cents as its persistence boundary", () => {
		expect(formatMoneyInputFromCents(18890)).toBe("188,90");
		expect(moneyInputToCents("0,33")).toBe(33);
	});
});
