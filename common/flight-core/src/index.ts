/**
 * Browser-safe entry point.
 *
 * `parse` and `resolve` are deliberately NOT re-exported here. They import
 * `@skytrace/data`, which is ~1.9MB of airport and airline records. Since the
 * frontend only needs formatters and geometry, re-exporting them from the
 * barrel would drag the whole dataset into the browser bundle every time
 * somebody imported `formatDistance`.
 *
 * Backend code that needs the resolver should import `@skytrace/flight-core/server`.
 */
export * from "./emissions.ts";
export * from "./format.ts";
export * from "./geo.ts";
