import type { Bilingual, Lang } from '@/lib/domain/types'

/**
 * UI copy, ported verbatim from the prototype. Turkish is authoritative: it is
 * the default and the fallback when an English string is missing.
 */
export const STR = {
  tr: {
    brandSub:'Performans', navGroupMain:'Genel', navGroupDepts:'Bölümler', roleHR:'İnsan Kaynakları Direktörü',
    newObjective:'Yeni Objective', checkin:'Check-in', period:'Dönem', layout:'Yerleşim',
    overview:'Performans Özeti', departments:'Bölümler', report:'Yönetici Raporu', admin:'Yönetim',
    overviewTitle:'Performans Özeti', companyGoal:'Şirket Hedefi', overallProgress:'Genel ilerleme',
    quarterNote:'Yıllık hedef · çeyreklik key result döngüsü · KR ortalaması ile hesaplanır',
    deptRanking:'Bölüm sıralaması', sortedByProgress:'İlerlemeye göre sıralı',
    trend:'Trend', trendTitle:'Şirket ilerlemesi (aylık)', actual:'Gerçekleşen', targetPace:'Hedef tempo',
    distribution:'Dağılım', distributionTitle:'Key result durumları',
    comparison:'Karşılaştırma', comparisonTitle:'Bölüm ilerlemesi',
    attention:'Dikkat', attentionTitle:'Müdahale gereken key resultlar',
    layoutHero:'Hero', layoutCockpit:'Kokpit', layoutFocus:'Odak',
    kpiDepts:'Aktif bölüm', kpiObjectives:'Objective', kpiKrs:'Key result', kpiAvg:'Ortalama ilerleme',
    kpiDeptsMeta:'8 bölüm lideri', kpiObjectivesMeta:'yıllık hedefe bağlı', kpiKrsMeta:'çeyreklik ölçüm',
    kpiAvgMeta:'KR ortalaması', kpiOpen:'Gelişime Açık KR', kpiOpenMeta:'%60 altı ilerleme',
    statusNotStarted:'Başlamadı', statusOpen:'Gelişime Açık', statusBelow:'Beklenenin Altında', statusExpected:'Beklenen', statusAbove:'Beklenenin Üzerinde',
    attentionEmpty:'Her şey yolunda — müdahale gereken key result yok.',
    confHigh:'Yüksek güven', confMid:'Orta güven', confLow:'Düşük güven',
    objective:'Objective', keyResults:'Key Results', owner:'Sorumlu', deptAvg:'Bölüm ortalaması',
    backOverview:'Performans Özeti', filter:'Filtre', filterAll:'Tümü', compactMode:'Kompakt',
    toggleKrs:'Key resultları aç/kapa', update:'Güncelle', addKr:'KR ekle', remove:'Kaldır',
    objectiveProgress:'Objective ilerlemesi', simpleAvgNote:'Key result ortalaması (ağırlıksız)',
    activity:'Hareketler', emptyDept:'Bu bölümde bu dönem için henüz objective yok.',
    createTitle:'Yeni objective oluştur', createLead:'Yıllık şirket hedefine bağlı, çeyreklik ölçülebilir key resultlarla bir objective tanımla.',
    step1:'1 · Objective', step2:'2 · Key Results', fieldObjective:'Objective adı', phObjective:'Örn. Misafir deneyim skorunu kalıcı olarak yükselt',
    fieldDept:'Bölüm', fieldOwner:'Sorumlu', fieldPeriod:'Dönem', fieldKr:'Key result', phKr:'Örn. NPS skorunu 60’a çıkar',
    fieldUnit:'Birim', krCountHint:'2–5 key result önerilir', save:'Objective’i kaydet', cancel:'Vazgeç',
    titleHintOk:'İyi — sonuç odaklı ve ölçülebilir.', titleHintShort:'Biraz daha açık yaz: ne değişecek?',
    validationReady:'Kaydetmeye hazır.', validationMissing:'Objective adı ve en az 1 key result gerekli.',
    reportTitle:'Yönetici Raporu', deptTable:'Bölüm kırılımı', clickToSort:'Sıralamak için başlığa tıkla',
    thKr:'Key result', thStart:'Başlangıç', thCurrent:'Güncel', thTarget:'Hedef', thProgress:'İlerleme',
    thConfidence:'Güven', thAction:'Aksiyon', thDept:'Bölüm', thObjectives:'Objective', thKrs:'KR',
    thOpen:'Gelişime Açık', thStatus:'Durum', thUser:'Kullanıcı', thRole:'Rol', thKrOwned:'Sahip KR',
    adminTitle:'Yönetim', adminLead:'Kullanıcılar, roller ve OKR dönemleri.', invite:'Kullanıcı davet et',
    periods:'Dönemler', users:'Kullanıcılar', stateActive:'Aktif', stateClosed:'Kapandı', statePlanned:'Planlandı',
    stateInvited:'Davet edildi', statePassive:'Pasif',
    weeklyCheckin:'Haftalık check-in', preview:'Yeni ilerleme', newValue:'Yeni değer', confidence:'Güven',
    note:'Not', phNote:'Bu hafta ne oldu, önümüzdeki hafta ne yapılacak?', saveCheckin:'Check-in’i kaydet',
    pickKr:'Hangi key result?', pickKrLead:'Bu hafta güncellenmemiş key resultlar önce gelir.',
    toastCheckin:'Check-in kaydedildi', toastCreated:'Objective oluşturuldu', toastKrAdded:'Yeni key result eklendi',
    toastInvite:'Davet gönderildi', deltaVsLast:'geçen çeyreğe göre'
  },
  en: {
    brandSub:'Performance', navGroupMain:'General', navGroupDepts:'Departments', roleHR:'HR Director',
    newObjective:'New objective', checkin:'Check-in', period:'Period', layout:'Layout',
    overview:'Performance Overview', departments:'Departments', report:'Executive Report', admin:'Admin',
    overviewTitle:'Performance Overview', companyGoal:'Company Goal', overallProgress:'Overall progress',
    quarterNote:'Annual goal · quarterly key result cycle · simple KR average',
    deptRanking:'Department ranking', sortedByProgress:'Sorted by progress',
    trend:'Trend', trendTitle:'Company progress (monthly)', actual:'Actual', targetPace:'Target pace',
    distribution:'Distribution', distributionTitle:'Key result statuses',
    comparison:'Comparison', comparisonTitle:'Department progress',
    attention:'Attention', attentionTitle:'Key results needing action',
    layoutHero:'Hero', layoutCockpit:'Cockpit', layoutFocus:'Focus',
    kpiDepts:'Active departments', kpiObjectives:'Objectives', kpiKrs:'Key results', kpiAvg:'Average progress',
    kpiDeptsMeta:'8 department leads', kpiObjectivesMeta:'tied to the annual goal', kpiKrsMeta:'quarterly measures',
    kpiAvgMeta:'simple KR average', kpiOpen:'Needs development', kpiOpenMeta:'below 60% progress',
    statusNotStarted:'Not started', statusOpen:'Needs development', statusBelow:'Below expectations', statusExpected:'Meets expectations', statusAbove:'Exceeds expectations',
    attentionEmpty:'All good — no key result needs action.',
    confHigh:'High confidence', confMid:'Medium confidence', confLow:'Low confidence',
    objective:'Objective', keyResults:'Key Results', owner:'Owner', deptAvg:'Department average',
    backOverview:'Performance Overview', filter:'Filter', filterAll:'All', compactMode:'Compact',
    toggleKrs:'Toggle key results', update:'Update', addKr:'Add KR', remove:'Remove',
    objectiveProgress:'Objective progress', simpleAvgNote:'Unweighted key result average',
    activity:'Activity', emptyDept:'No objectives for this department this period yet.',
    createTitle:'Create a new objective', createLead:'Define an objective tied to the annual company goal, with measurable quarterly key results.',
    step1:'1 · Objective', step2:'2 · Key Results', fieldObjective:'Objective name', phObjective:'e.g. Lift guest experience for good',
    fieldDept:'Department', fieldOwner:'Owner', fieldPeriod:'Period', fieldKr:'Key result', phKr:'e.g. Raise NPS to 60',
    fieldUnit:'Unit', krCountHint:'2–5 key results recommended', save:'Save objective', cancel:'Cancel',
    titleHintOk:'Good — outcome-oriented and measurable.', titleHintShort:'Be more specific: what will change?',
    validationReady:'Ready to save.', validationMissing:'An objective name and at least 1 key result are required.',
    reportTitle:'Executive Report', deptTable:'Department breakdown', clickToSort:'Click a header to sort',
    thKr:'Key result', thStart:'Start', thCurrent:'Current', thTarget:'Target', thProgress:'Progress',
    thConfidence:'Confidence', thAction:'Action', thDept:'Department', thObjectives:'Objectives', thKrs:'KRs',
    thOpen:'Needs dev.', thStatus:'Status', thUser:'User', thRole:'Role', thKrOwned:'KRs owned',
    adminTitle:'Admin', adminLead:'Users, roles and OKR periods.', invite:'Invite user',
    periods:'Periods', users:'Users', stateActive:'Active', stateClosed:'Closed', statePlanned:'Planned',
    stateInvited:'Invited', statePassive:'Inactive',
    weeklyCheckin:'Weekly check-in', preview:'New progress', newValue:'New value', confidence:'Confidence',
    note:'Note', phNote:'What happened this week, what is next?', saveCheckin:'Save check-in',
    pickKr:'Which key result?', pickKrLead:'Key results not updated this week come first.',
    toastCheckin:'Check-in saved', toastCreated:'Objective created', toastKrAdded:'Key result added',
    toastInvite:'Invitation sent', deltaVsLast:'vs last quarter'
  }
} as const

export type StringKey = keyof typeof STR.tr

/** Reads a bilingual database field, falling back to Turkish. */
export function tx(o: Bilingual | null | undefined, lang: Lang): string {
  if (!o) return ''
  return (lang === 'en' ? o.en : o.tr) || o.tr
}
