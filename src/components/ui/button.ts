export type ButtonVariant = "primary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

/**
 * 按钮的类名工厂：样式集中在 atoms 层，
 * `<button>` / `<Link>` 的语义仍然由调用处决定（动作 vs 导航）。
 */
export function buttonClass({
  variant = "primary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return [
    "button",
    `button-${variant}`,
    size === "sm" ? "button-small" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
