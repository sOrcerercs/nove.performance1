import type { Lang } from '@/lib/domain/types'

/**
 * Every word on the help screen outside the guide entries themselves, in both
 * languages. Turkish is authoritative (as in `lib/i18n/strings.ts`).
 */
export const HELP_COPY = {
  tr: {
    overline: 'Yardım',
    title: 'Kullanım kılavuzu',
    lead:
      'Programın nasıl kullanıldığına dair sorular ve cevapları. Aradığınızı bulamazsanız bir yöneticiye söyleyin — buraya ekleyebilir.',
    searchPlaceholder: 'Soru veya kelime ara… (örn. parola, geçmiş veri, mali yıl)',
    searchLabel: 'Kılavuzda ara',
    countUnit: 'soru',
    addQuestion: '+ Soru ekle',
    all: 'Tümü',
    editTitle: 'Soruyu düzenle',
    newTitle: 'Yeni soru ekle',
    category: 'Kategori',
    question: 'Soru',
    questionPlaceholder: 'Örn. Bir çalışan işten ayrılınca ne yapmalıyım?',
    answer: 'Cevap',
    answerPlaceholder: 'Adım adım anlatın.\n\nBoş satır yeni paragraf açar.',
    formatHint: 'Biçimlendirme:',
    formatBold: '**kalın**',
    formatCode: '`kod`',
    formatRest: 'boş satır yeni paragraf. Başka bir şey desteklenmiyor.',
    preview: 'Önizleme',
    cancel: 'Vazgeç',
    save: 'Kaydet',
    toastUpdated: 'Soru güncellendi',
    toastAdded: 'Soru eklendi',
    toastDeleted: 'Soru silindi',
    noResults: (q: string) =>
      `“${q}” için sonuç yok. Farklı bir kelime deneyin ya da kategori filtresini kaldırın.`,
    customTag: 'ekip notu',
    addedBy: 'Ekleyen:',
    edit: 'Düzenle',
    confirmDelete: 'Evet, sil',
    delete: 'Sil',
    builtinNote: 'Yerleşik rehber — kodda tutulur, buradan düzenlenemez.',
  },
  en: {
    overline: 'Help',
    title: 'User guide',
    lead:
      'Questions and answers on how to use the app. If you cannot find what you need, tell an admin — they can add it here.',
    searchPlaceholder: 'Search a question or word… (e.g. password, past data, fiscal year)',
    searchLabel: 'Search the guide',
    countUnit: 'questions',
    addQuestion: '+ Add question',
    all: 'All',
    editTitle: 'Edit question',
    newTitle: 'Add a new question',
    category: 'Category',
    question: 'Question',
    questionPlaceholder: 'e.g. What should I do when an employee leaves?',
    answer: 'Answer',
    answerPlaceholder: 'Explain it step by step.\n\nA blank line starts a new paragraph.',
    formatHint: 'Formatting:',
    formatBold: '**bold**',
    formatCode: '`code`',
    formatRest: 'blank line for a new paragraph. Nothing else is supported.',
    preview: 'Preview',
    cancel: 'Cancel',
    save: 'Save',
    toastUpdated: 'Question updated',
    toastAdded: 'Question added',
    toastDeleted: 'Question deleted',
    noResults: (q: string) =>
      `No results for “${q}”. Try a different word or clear the category filter.`,
    customTag: 'team note',
    addedBy: 'Added by:',
    edit: 'Edit',
    confirmDelete: 'Yes, delete',
    delete: 'Delete',
    builtinNote: 'Built-in guide — kept in the code, cannot be edited here.',
  },
} as const

export type HelpCopy = (typeof HELP_COPY)[Lang]
