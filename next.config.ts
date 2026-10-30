import type { NextConfig } from "next";

/**
 * 词锚只以 Tauri 桌面端发布：`pnpm build` 产出 out/，
 * 由 `src-tauri/tauri.conf.json` 的 frontendDist 直接加载。
 * 不再有 basePath / assetPrefix —— 网页版已退役。
 */
const nextConfig: NextConfig = {
  output: "export",
  /* 静态导出下每个路由都落成目录 + index.html，Tauri 的协议处理器同样按目录找 */
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
