export default function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="23" fill="#1e2422" stroke="#b07e33" strokeWidth="1.5" />
      <path
        d="M24 14c-2.8-1.6-6.4-2.4-9.5-2.1v16.6c3.1-.3 6.7.5 9.5 2.1V14Z"
        fill="#b07e33"
      />
      <path
        d="M24 14c2.8-1.6 6.4-2.4 9.5-2.1v16.6c-3.1-.3-6.7.5-9.5 2.1V14Z"
        fill="#dca755"
      />
      <path d="M24 12.6v18.8" stroke="#1e2422" strokeWidth="0.6" />
    </svg>
  );
}
