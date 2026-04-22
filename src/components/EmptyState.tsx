import Link from "next/link";
import styles from "./EmptyState.module.css";

export type EmptyStateProps = {
  icon?: string;
  label: string;
  hint?: string;
  cta?: { label: string; href?: string; onClick?: () => void };
  compact?: boolean;
  className?: string;
};

export default function EmptyState({
  icon = "∅",
  label,
  hint,
  cta,
  compact = false,
  className = "",
}: EmptyStateProps) {
  const cls = `${styles.root} ${compact ? styles.compact : ""} ${className}`.trim();
  return (
    <div className={cls}>
      <div className={styles.icon} aria-hidden="true">
        {icon}
      </div>
      <span className={styles.label}>{label}</span>
      {hint && <span className={styles.hint}>{hint}</span>}
      {cta &&
        (cta.href ? (
          <Link href={cta.href} className={styles.cta}>
            {cta.label}
          </Link>
        ) : (
          <button type="button" onClick={cta.onClick} className={styles.cta}>
            {cta.label}
          </button>
        ))}
    </div>
  );
}
