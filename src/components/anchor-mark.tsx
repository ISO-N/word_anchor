/**
 * 词锚的记号：一枚锚。
 *
 * 单独成组件，是因为它出现在页头、页脚与「正在读取」占位三处；
 * 三份手抄的 path 迟早会漂。描边用 currentColor，颜色交给调用处。
 */
export function AnchorMark({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="4.6" r="1.9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 6.9v12.6M8.3 10.4h7.4M4.3 13.4c0 4.6 3.4 6.9 7.7 6.9s7.7-2.3 7.7-6.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
