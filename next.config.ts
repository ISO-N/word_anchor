import type { NextConfig } from "next";

/**
 * 部署到 https://<user>.github.io/<repo>/ 时，构建前设置
 * NEXT_PUBLIC_BASE_PATH=/<repo>；使用自定义域名时留空。
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
  .trim()
  .replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // 纯静态导出：产物在 out/，可直接托管在 GitHub Pages
  output: "export",
  trailingSlash: true,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
};

export default nextConfig;
