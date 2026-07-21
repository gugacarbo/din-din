import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { IconSelect } from "#/components/finance/icon-select.tsx";

describe("IconSelect", () => {
	it("opens an icon drawer with semantic search and closes after choosing an icon on mobile", async () => {
		const user = userEvent.setup();
		const onValueChange = vi.fn();
		render(<IconSelect onValueChange={onValueChange} value="Dog" />);

		await user.click(await screen.findByRole("button", { name: "Dog" }));
		const dialog = await screen.findByRole("dialog", {
			name: "Escolha um ícone",
		});
		expect(dialog).toHaveAttribute("data-slot", "sheet-content");
		expect(dialog).toHaveClass("h-[85dvh]");

		const search = within(dialog).getByRole("textbox", {
			name: "Buscar ícone",
		});
		await user.type(search, "pet");

		const grid = within(dialog).getByRole("list", {
			name: "Ícones disponíveis",
		});
		expect(within(grid).getAllByRole("button")).toHaveLength(10);
		expect(
			within(grid).getByRole("button", { name: "Gato sentado" }),
		).toBeInTheDocument();

		await user.click(within(grid).getByRole("button", { name: "Gato" }));
		expect(onValueChange).toHaveBeenCalledWith("Cat");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
