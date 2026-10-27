export function DataPlaceholder({
  label = "正在读取本地词库…",
}: {
  label?: string;
}) {
  return (
    <div className="shell page-shell">
      <div className="data-placeholder" role="status" aria-live="polite">
        <span className="placeholder-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 4v16M8 8h8M6 13c0 4.4 2.7 7 6 7s6-2.6 6-7M6 13a2 2 0 1 0 0 .1M18 13a2 2 0 1 0 0 .1"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <p>{label}</p>
      </div>
    </div>
  );
}
