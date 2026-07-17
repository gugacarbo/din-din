/**
 * '*.ts': {
 *  title: 'Log staged TS files to console',
 *  task: async (files) => {
 *   console.log('Staged TS files:', files);
 *  },
 * },
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default {
	"*": "pnpm format",
	"*.{md,mdx}": (files) => {
		const paths = files.map((file) => `"${file}"`).join(" ");
		return `pnpm prettier --write ${paths} --log-level=warn --no-error-on-unmatched-pattern --cache`;
	},
	"*.{js,ts,jsx,tsx}": [
		// Run TypeScript compiler on staged files without emitting output
		// "tsc-files --noEmit",
		// Run test-staged to execute tests related to staged files
		// "test-staged",
	],
};
