import "@testing-library/jest-dom/vitest";

/*
 * The application refuses to boot without a Duffel token, because every price
 * it shows is live provider data with no fallback. Tests never call the live
 * API: they use recorded fixtures and tests/helpers/fake-flight-search.ts, so a
 * placeholder token is enough to let the modules import.
 */
process.env.APP_ENV ??= "test";
process.env.DUFFEL_ACCESS_TOKEN ??= "duffel_test_placeholder";
