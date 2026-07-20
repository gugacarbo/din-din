import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { database } from "#/env";
import {
	type CategoryDto,
	createFinanceService,
	financeSchemas,
	type TransactionDto,
} from "#/server/finance-service";

export type { CategoryDto, TransactionDto };

async function service() {
	return createFinanceService({ d1: database, headers: getRequestHeaders() });
}

export const getSessionUser = createServerFn({ method: "GET" }).handler(
	async () => (await service()).getSessionUser(),
);

export const listCategories = createServerFn({ method: "GET" })
	.validator(financeSchemas.listCategories)
	.handler(async ({ data }) => (await service()).listCategories(data));

export const createCategory = createServerFn({ method: "POST" })
	.validator(financeSchemas.categoryInput)
	.handler(async ({ data }) => (await service()).createCategory(data));

export const updateCategory = createServerFn({ method: "POST" })
	.validator(financeSchemas.categoryUpdate)
	.handler(async ({ data }) => (await service()).updateCategory(data));

export const archiveCategory = createServerFn({ method: "POST" })
	.validator(financeSchemas.id)
	.handler(async ({ data }) => (await service()).archiveCategory(data));

export const restoreCategory = createServerFn({ method: "POST" })
	.validator(financeSchemas.id)
	.handler(async ({ data }) => (await service()).restoreCategory(data));

export const createTransaction = createServerFn({ method: "POST" })
	.validator(financeSchemas.transactionInput)
	.handler(async ({ data }) => (await service()).createTransaction(data));

export const updateTransaction = createServerFn({ method: "POST" })
	.validator(financeSchemas.transactionUpdate)
	.handler(async ({ data }) => (await service()).updateTransaction(data));

export const archiveTransaction = createServerFn({ method: "POST" })
	.validator(financeSchemas.id)
	.handler(async ({ data }) => (await service()).archiveTransaction(data));

export const restoreTransaction = createServerFn({ method: "POST" })
	.validator(financeSchemas.id)
	.handler(async ({ data }) => (await service()).restoreTransaction(data));

export const listTransactions = createServerFn({ method: "GET" })
	.validator(financeSchemas.listTransactions)
	.handler(async ({ data }) => (await service()).listTransactions(data));

export const getDashboard = createServerFn({ method: "GET" }).handler(
	async () => (await service()).getDashboard(),
);

export const getReport = createServerFn({ method: "GET" })
	.validator(financeSchemas.report)
	.handler(async ({ data }) => (await service()).getReport(data));
