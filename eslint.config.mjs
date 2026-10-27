import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    ignores: [".next/**", "out/**", "node_modules/**", "scripts/**"],
  },
  ...nextCoreWebVitals,
];

export default config;
