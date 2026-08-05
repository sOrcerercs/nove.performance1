import styles from './ui.module.css'

interface Props {
  icon: React.ReactNode
  value: string
  label: string
  meta?: string
  delta?: { direction: 'up' | 'down'; text: string }
}

export function KpiCard({ icon, value, label, meta, delta }: Props) {
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiBadge} aria-hidden="true">{icon}</span>
        {delta ? (
          <span
            className={`${styles.kpiDelta} ${delta.direction === 'up' ? styles.kpiUp : styles.kpiDown}`}
          >
            {delta.direction === 'up' ? '▲' : '▼'} {delta.text}
          </span>
        ) : null}
      </div>
      <div className={styles.kpiValue}>{value}</div>
      <div>
        <div className={styles.kpiLabel}>{label}</div>
        {meta ? <div className={styles.kpiMeta}>{meta}</div> : null}
      </div>
    </div>
  )
}
