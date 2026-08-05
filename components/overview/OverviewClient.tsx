'use client'

import { BarChart } from '@/components/charts/BarChart'
import { DonutChart } from '@/components/charts/DonutChart'
import { TrendChart, TrendLegend } from '@/components/charts/TrendChart'
import { KpiCard } from '@/components/ui/KpiCard'
import { tx } from '@/lib/i18n/strings'
import { usePrefs, type LayoutVariant } from '@/lib/prefs/PrefsProvider'
import type { OverviewVm } from '@/lib/queries/overview'
import { AttentionList } from './AttentionList'
import { CompanyHero } from './CompanyHero'
import { DeptCard } from './DeptCard'
import styles from './overview.module.css'

const VARIANTS: { key: LayoutVariant; label: 'layoutHero' | 'layoutCockpit' | 'layoutFocus' }[] = [
  { key: 'hero', label: 'layoutHero' },
  { key: 'cockpit', label: 'layoutCockpit' },
  { key: 'focus', label: 'layoutFocus' },
]

export function OverviewClient({ vm }: { vm: OverviewVm }) {
  const { t, lang, layout, setLayout } = usePrefs()

  const kpis = (
    <div className={styles.kpiRow}>
      <KpiCard icon="🏢" value={String(vm.kpis.depts)} label={t('kpiDepts')} meta={t('kpiDeptsMeta')} />
      <KpiCard icon="🎯" value={String(vm.kpis.objectives)} label={t('kpiObjectives')} meta={t('kpiObjectivesMeta')} />
      <KpiCard icon="📏" value={String(vm.kpis.krs)} label={t('kpiKrs')} meta={t('kpiKrsMeta')} />
      <KpiCard icon="📈" value={`${vm.kpis.avgPct}%`} label={t('kpiAvg')} meta={t('kpiAvgMeta')} />
      <KpiCard icon="⚠️" value={String(vm.kpis.openKrs)} label={t('kpiOpen')} meta={t('kpiOpenMeta')} />
    </div>
  )

  const charts = (
    <div className={styles.chartGrid}>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{t('trendTitle')}</h3>
        <TrendLegend />
        <TrendChart trend={vm.trend} />
      </div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{t('distributionTitle')}</h3>
        <DonutChart slices={vm.distribution} />
      </div>
    </div>
  )

  const comparison = (
    <div className={styles.card}>
      <BarChart
        title={t('comparisonTitle')}
        rows={vm.depts.map((d) => ({
          key: d.slug,
          emoji: d.emoji,
          name: tx({ tr: d.nameTr, en: d.nameEn }, lang),
          pct: d.pct,
        }))}
      />
    </div>
  )

  const departments = (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{t('departments')}</h2>
        <span className={styles.sectionMeta}>
          {vm.kpis.depts} · {vm.kpis.objectives} {t('objective').toLowerCase()} · {vm.kpis.krs} KR
        </span>
      </div>
      <div className={styles.deptGrid}>
        {vm.depts.map((d) => <DeptCard dept={d} key={d.slug} />)}
      </div>
    </section>
  )

  const attention = (
    <section className={styles.section}>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t('attentionTitle')}</h2>
        <p className={styles.cardMeta}>{t('kpiOpenMeta')}</p>
        <AttentionList items={vm.attention} />
      </div>
    </section>
  )

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.h1}>{t('overviewTitle')}</h1>
        <div className={styles.variantSwitch}>
          <span className={styles.variantLabel}>{t('layout')}</span>
          <div className={styles.segmented} role="group" aria-label={t('layout')}>
            {VARIANTS.map((v) => (
              <button
                key={v.key}
                type="button"
                className={`${styles.segment} ${layout === v.key ? styles.segmentActive : ''}`}
                aria-pressed={layout === v.key}
                onClick={() => setLayout(v.key)}
              >
                {t(v.label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* The three variants reorder the same blocks rather than changing them,
          exactly as the prototype does. */}
      {layout === 'hero' ? (
        <>
          <CompanyHero companyPct={vm.companyPct} stats={vm.kpis} />
          {kpis}
          {departments}
          <section className={styles.section}>{charts}</section>
          <section className={styles.section}>{comparison}</section>
          {attention}
        </>
      ) : null}

      {layout === 'cockpit' ? (
        <>
          {kpis}
          <section className={styles.section}>{charts}</section>
          <section className={styles.section}>{comparison}</section>
          {attention}
          {departments}
        </>
      ) : null}

      {layout === 'focus' ? (
        <>
          {attention}
          {kpis}
          {departments}
          <section className={styles.section}>{comparison}</section>
        </>
      ) : null}
    </>
  )
}
