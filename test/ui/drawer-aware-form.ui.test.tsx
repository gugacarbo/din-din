import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DrawerAwareForm } from "#/components/drawer-aware-form.tsx";

describe("DrawerAwareForm", () => {
	it("keeps fields grouped at the top of the available drawer space", () => {
		const { container } = render(
			<DrawerAwareForm
				actions={<button type="submit">Salvar</button>}
				mobileDrawer
			>
				<label>
					Nome
					<input />
				</label>
			</DrawerAwareForm>,
		);

		const fieldContainer = container.querySelector("form > div");
		expect(fieldContainer).toHaveClass("content-start");
	});
});
