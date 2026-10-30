import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "scripts/**",
      /* tauri 的构建产物里也有 .js（codegen 资源），它们不是我们的源码 */
      "src-tauri/target/**",
      "src-tauri/gen/**",
    ],
  },
  ...nextCoreWebVitals,
];

export default config;
