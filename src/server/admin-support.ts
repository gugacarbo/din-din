import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

import { database } from "#/env";
import { requireAdmin } from "#/server/admin-auth.ts";
import {
	adminSupportDetail,
	listAdminSupport,
} from "#/server/admin-support-service.ts";

export const getAdminMembership = createServerFn({ method: "GET" }).handler(
	async () => {
		try {
			await requireAdmin(database, getRequestHeaders());
			return { isAdmin: true };
		} catch {
			return { isAdmin: false };
		}
	},
);

export const getAdminSupportPage = createServerFn({ method: "GET" })
	.validator(
		z.object({
			cursor: z.string().optional(),
			limit: z.number().int().min(1).max(50).default(25),
		}),
	)
	.handler(async ({ data }) =>
		listAdminSupport(database, getRequestHeaders(), data.cursor, data.limit),
	);

export const getAdminSupportDetail = createServerFn({ method: "GET" })
	.validator(z.object({ reportId: z.string().min(1) }))
	.handler(async ({ data }) =>
		adminSupportDetail(database, getRequestHeaders(), data.reportId),
	);
