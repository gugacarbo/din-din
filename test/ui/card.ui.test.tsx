import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card, CardFooter } from "#/components/ui/card.tsx";

describe("Card", () => {
	it("uses a compact default gap between its contents", () => {
		const { getByTestId } = render(
			<Card data-testid="card">
				<span>Primeiro</span>
				<span>Segundo</span>
			</Card>,
		);

		expect(getByTestId("card")).toHaveClass("gap-(--card-spacing)");
		expect(getByTestId("card")).toHaveClass("[--card-spacing:--spacing(4)]");
	});

	it("supports compact cards and footer content", () => {
		const { getByTestId } = render(
			<Card data-testid="card" size="sm">
				<CardFooter data-testid="footer">Ações</CardFooter>
			</Card>,
		);

		expect(getByTestId("card")).toHaveAttribute("data-size", "sm");
		expect(getByTestId("footer")).toHaveAttribute("data-slot", "card-footer");
	});
});
