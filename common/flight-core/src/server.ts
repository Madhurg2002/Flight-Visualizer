/**
 * Server-side entry point: the parser and the resolver.
 *
 * Kept separate from the main barrel so that importing a formatter in the
 * browser does not pull `@skytrace/data` — and its 1.9MB of airport and
 * airline records — into the client bundle.
 */
export * from "./parse";
export * from "./resolve";
