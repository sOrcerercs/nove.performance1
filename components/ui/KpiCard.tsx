import styles from './ui.module.css'

interface Props {
  icon: React.ReactNode
  value: string
  label: string
  meta?: string
}

export function KpiCard({ icon, value, label, meta }: Props) {
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiBadge} aria-hidden="true">{icon}</span>
      </div>
      <div className={styles.kpiValue}>{value}</div>
      <div>
        <div className={styles.kpiLabel}>{label}</div>
        {meta ? <div className={styles.kpiMeta}>{meta}</div> : null}
      </div>
    </div>
  )
}
