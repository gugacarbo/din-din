import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card } from "#/components/ui/card.tsx";

describe("Card", () => {
	it("uses a compact default gap between its contents", () => {
		const { getByTestId } = render(
			<Card data-testid="card">
				<span>Primeiro</span>
				<span>Segundo</span>
			</Card>,
		);

		expect(getByTestId("card")).toHaveClass("gap-4");
	});
});
