import { initials } from '@/lib/domain/format'
import styles from './ui.module.css'

export function Avatar({ name }: { name: string }) {
  return (
    <span className={styles.avatar} title={name} aria-hidden="true">
      {initials(name)}
    </span>
  )
}
