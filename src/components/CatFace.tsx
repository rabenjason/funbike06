export function CatFace({ className = "", animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {animated && (
        <path d="M50 44c8 2 10 8 6 12" className="animate-fb-tail" fill="none" stroke="#27272a" strokeWidth="4" strokeLinecap="round" />
      )}
      <g className={animated ? "animate-fb-ear" : ""}>
        <path d="M14 22L16 8l13 8z" fill="#27272a" />
        <path d="M50 22L48 8l-13 8z" fill="#27272a" />
      </g>
      <ellipse cx="32" cy="34" rx="22" ry="19" fill="#27272a" />
      <ellipse cx="32" cy="39" rx="13" ry="10" fill="#fde68a" />
      <g className={animated ? "animate-fb-blink" : ""}>
        <ellipse cx="24" cy="30" rx="3.4" ry="4.2" fill="#ffd100" />
        <ellipse cx="40" cy="30" rx="3.4" ry="4.2" fill="#ffd100" />
        <ellipse cx="24" cy="30" rx="1.3" ry="3.2" fill="#27272a" />
        <ellipse cx="40" cy="30" rx="1.3" ry="3.2" fill="#27272a" />
      </g>
      <path d="M32 37l-2.6-2.4h5.2z" fill="#27272a" />
      <path d="M32 38c0 2.6-2.6 2.6-3.6 1M32 38c0 2.6 2.6 2.6 3.6 1" stroke="#27272a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <g stroke="#27272a" strokeWidth="1.4" strokeLinecap="round">
        <path d="M19 37H9M19 41l-9 3M45 37h10M45 41l9 3" />
      </g>
    </svg>
  );
}
