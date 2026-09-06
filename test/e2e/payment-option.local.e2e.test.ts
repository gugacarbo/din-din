import { expect, test } from "@playwright/test";

const testUser = `e2e-payment-issue-${process.pid}@example.com`;
const paymentMethod = `E2E Cartão Issue 20 ${process.pid}`;

test("exibe e permite selecionar a forma de pagamento em um novo lançamento", async ({
	page,
}) => {
	const login = await page.context().request.post("/api/auth/dev-login", {
		data: { email: testUser },
	});
	expect(login.ok()).toBe(true);

	await page.goto("/payments");
	await expect(page).toHaveURL(/\/payments$/);
	await page.waitForLoadState("networkidle");
	const newPaymentButton = page.getByRole("button", { name: "Nova forma" });
	await expect(newPaymentButton).toBeVisible();
	await newPaymentButton.click();
	const paymentDialog = page.getByRole("dialog");
	await expect(paymentDialog).toBeVisible();
	await paymentDialog.locator("#payment-name").fill(paymentMethod);
	await page.getByRole("button", { name: "Salvar forma" }).click();
	await expect(page.getByText(paymentMethod, { exact: true })).toBeVisible();

	await page.goto("/transactions");
	await page.waitForLoadState("networkidle");
	const newTransactionButton = page.getByRole("button", {
		name: "Novo lançamento",
	});
	await expect(newTransactionButton).toBeVisible();
	await newTransactionButton.click();
	await expect(page.getByRole("dialog")).toBeVisible();
	const paymentSelect = page.getByRole("combobox", {
		name: "Forma de pagamento (opcional)",
	});
	await paymentSelect.click();
	const option = page.getByRole("option", { name: paymentMethod, exact: true });
	await expect(option).toBeVisible();
	await option.click();
	await expect(paymentSelect).toContainText(paymentMethod);
});
