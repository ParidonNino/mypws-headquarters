// Minimal stand-ins for the Cloudflare Workers runtime types this repo uses.
//
// Without these, `npm run typecheck` reports three phantom errors (`Fetcher`,
// `D1Database`, and the `cloudflare:workers` module) that have nothing to do
// with the code, which is enough noise to make the script not worth running.
// `vinext build` never surfaced them because esbuild strips types without
// checking them.
//
// This is a stopgap. Replace it with the real, complete types by running:
//
//   npx wrangler types
//
// That writes worker-configuration.d.ts from the actual wrangler config, at
// which point this file should be deleted. wrangler is already a devDependency,
// so it needs no new install — just a machine with Node available.

declare interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

declare interface D1Database {
  prepare(query: string): unknown;
  batch(statements: unknown[]): Promise<unknown[]>;
  exec(query: string): Promise<unknown>;
}

declare module "cloudflare:workers" {
  export const env: Record<string, unknown> & { DB?: D1Database };
}
