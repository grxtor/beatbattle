import Sketch from "./Sketch";
import styles from "./LoadingShell.module.css";

export type LoadingShellProps = {
  label?: string;
  variant?: 1 | 2 | 3;
};

export default function LoadingShell({
  label = "LOADING",
  variant = 1,
}: LoadingShellProps) {
  return (
    <main className={styles.page}>
      <Sketch variant={variant} className={styles.shell}>
        <div className={styles.body}>
          <span className={styles.label}>{label}</span>
          <div className={styles.dots} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </Sketch>
    </main>
  );
}
