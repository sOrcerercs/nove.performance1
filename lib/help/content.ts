import type { Bilingual } from '@/lib/domain/types'
import type { HelpArticle, HelpCategory } from './types'

/**
 * The built-in guide.
 *
 * Version-controlled on purpose: these answers describe how the application
 * behaves, so they belong next to the code that behaves that way. Questions a
 * team discovers in daily use go in the `help_articles` table instead, added
 * from the help screen without a deploy.
 *
 * Every entry is written in Turkish (authoritative) and English. Turkish stays
 * in `question`/`answer` so the type is shared with the single-language team
 * notes; English rides along in `en` (see `localizeArticle`). A cross-reference
 * quotes the other question's title in the same language, so keep both in step.
 *
 * Answers support blank-line paragraphs, `**kalın**` and `` `kod` ``. Nothing
 * else — the same renderer displays admin-written text, so it must stay safe.
 */
const entry = (
  id: string,
  category: HelpCategory,
  question: Bilingual,
  answer: Bilingual,
): HelpArticle => ({
  id: `builtin-${id}`,
  category,
  question: question.tr,
  answer: answer.tr,
  en: { question: question.en, answer: answer.en },
  source: 'builtin',
})

export const BUILTIN_HELP: readonly HelpArticle[] = [
  /* ------------------------------- basics ------------------------------- */
  entry(
    'genel-bakis',
    'basics',
    {
      tr: 'Bu program ne işe yarıyor?',
      en: 'What is this app for?',
    },
    {
      tr: `Nove'un OKR'larını (Objective ve Key Result) tek yerde takip eder.

Yapı üç katmanlı: **bölüm** → **objective** → **key result**. Bir bölümün ilerlemesi, objective'lerinin ortalaması; bir objective'in ilerlemesi de key result'larının ortalamasıdır. Hepsi ağırlıksız — ölçülebilir her key result eşit sayar. "Ölçülemiyor" rozeti taşıyan bir key result hiç sayılmaz, sıfır olarak da değil — bkz. "'Ölçülemiyor' rozeti ne anlama geliyor?".

Aynı kural bir üst katmanda da geçerli: hiçbir key result'u ölçülemeyen bir objective, objective ortalamasına katılmaz. Şirket ilerlemesi de objective'i olan bölümlerin ortalamasıdır. Objective'i olmayan — ya da hiçbir key result'u ölçülemeyen — bölüm ortalamaya katılmaz, %0 olarak sayılmaz.`,
      en: `It tracks Nove's OKRs (objectives and key results) in one place.

There are three levels: **department** → **objective** → **key result**. A department's progress is the average of its objectives; an objective's progress is the average of its key results. None of it is weighted — every measurable key result counts equally. A key result with the "Not measurable" badge is not counted at all, not even as zero — see "What does the 'Not measurable' badge mean?".

The same rule applies one level up: an objective with no measurable key result is left out of the objective average. Company progress is the average of the departments that have objectives. A department with no objectives — or with no measurable key result — is left out of the average, not counted as 0%.`,
    },
  ),
  entry(
    'kimler-kullanir',
    'basics',
    {
      tr: 'Programı kimler kullanabiliyor?',
      en: 'Who can use the app?',
    },
    {
      tr: `Yalnızca İnsan Kaynakları ve Yönetim. Üç rol var:

**Yönetici** — her şeyi yapar: objective açma, check-in, kullanıcı, bölüm ve dönem yönetimi.

**Üst Yönetim** — yalnızca okur. Rapor dahil her şeyi görür, hiçbir şeyi değiştiremez.

**Personel** — programa **giriş yapamaz**. Objective ve key result'larda "sorumlu" olarak adı görünür, parolası yoktur. Bölüm liderleri ve ekip üyeleri bu kategoridedir.`,
      en: `Only Human Resources and Management. There are three roles:

**Admin** — can do everything: create objectives, check in, manage users, departments and periods.

**Executive** — read-only. Sees everything, including the report, but cannot change anything.

**Staff** — **cannot sign in**. Their name appears as "owner" on objectives and key results; they have no password. Department leads and team members are in this group.`,
    },
  ),
  entry(
    'ilerleme-hesabi',
    'basics',
    {
      tr: 'İlerleme yüzdesi nasıl hesaplanıyor?',
      en: 'How is the progress percentage calculated?',
    },
    {
      tr: `Başlangıç ve hedef arasındaki mesafenin ne kadarının kapandığına bakılır:

\`ilerleme = (güncel − başlangıç) ÷ (hedef − başlangıç)\`

Bu yüzden **düşürme hedefleri** de doğru çalışır. "Lead maliyetini 950'den 650'ye indir" hedefinde güncel değer 720 ise ilerleme %77'dir — ayrı bir "azalması iyi" işareti gerekmez.

Sonuç %0 ile %140 arasına sıkıştırılır. %0 altı, hedeften uzaklaşmayı negatif çubuk yerine "başlamadı" olarak gösterir; %140 üstü de aşırı aşılmış bir key result'ın üstteki ortalamaları ele geçirmesini engeller.

Başlangıç ve hedef **aynı** değerse bu formülün paydası sıfır olur — o key result "Ölçülemiyor" işaretlenir, bkz. bir sonraki soru.`,
      en: `It looks at how much of the gap between start and target has been closed:

\`progress = (current − start) ÷ (target − start)\`

That is why **reduction targets** work too. For "Cut lead cost from 950 to 650", if the current value is 720, progress is 77% — no separate "lower is better" flag is needed.

The result is clamped between 0% and 140%. Below 0%, moving away from the target shows as "not started" instead of a negative bar; above 140%, the cap stops a heavily overshot key result from taking over the averages above it.

If start and target are **the same**, the formula divides by zero — that key result is marked "Not measurable"; see the next question.`,
    },
  ),
  entry(
    'olculemiyor',
    'basics',
    {
      tr: '"Ölçülemiyor" rozeti ne anlama geliyor?',
      en: 'What does the "Not measurable" badge mean?',
    },
    {
      tr: `Bir key result'ın **başlangıcı ve hedefi aynıysa** kapanacak bir mesafe yoktur — ilerleme yüzdesi tanımsızdır, sıfır değil. Bu satırlar tabloda ilerleme çubuğu yerine "Ölçülemiyor" rozetiyle gösterilir.

Bu rozeti gördüğünüzde satır **hiçbir ortalamaya girmez**: objective, bölüm ve şirket ortalamalarının hepsi bu key result'ı atlar — sıfır olarak da saymaz, çünkü sıfır "hiç ilerleme yok" demek olurdu, oysa asıl durum "henüz hedef girilmemiş". Aynı sebeple bu satırlar Performans Özeti'ndeki "Dikkat" listesinde ve Yönetici Raporu'ndaki "Gelişime Açık" listesinde de görünmez — ölçülemeyen bir satıyı en acil müdahale gereken satırmış gibi göstermek yanıltıcı olurdu.

Düzeltmek için **Düzenle** ile gerçek başlangıç ve hedef değerlerini girin; ikisi birbirinden farklı olduğu anda rozet kalkar ve key result normal şekilde ölçülmeye başlar.`,
      en: `If a key result's **start and target are the same**, there is no gap to close — the progress percentage is undefined, not zero. In the tables these rows show a "Not measurable" badge instead of a progress bar.

A row with this badge **is left out of every average**: the objective, department and company averages all skip it — and do not count it as zero, because zero would mean "no progress at all" when the real situation is "no target entered yet". For the same reason these rows do not appear in the "Attention" list on the Performance Overview or the "Needs development" list in the Executive Report — showing a row that cannot be measured as the one most in need of action would be misleading.

To fix it, use **Edit** to enter the real start and target values; as soon as they differ, the badge goes away and the key result is measured normally.`,
    },
  ),
  entry(
    'durum-renkleri',
    'basics',
    {
      tr: 'Durum etiketleri neye göre değişiyor?',
      en: 'What decides the status labels?',
    },
    {
      tr: `Performans Yönetim Süreci Puanlama Tablosu'na göre, yukarıdan aşağı ilk uyan:

\`101–130\` Beklenenin Üzerinde · \`80–100\` Beklenen · \`60–79\` Beklenenin Altında · \`1–59\` Gelişime Açık · \`%0\` Başlamadı

%0 tabloda ayrıca yer almaz; henüz veri girilmemiş bir key result'ı gerçekten düşük performanstan ayırmak için "Başlamadı" olarak gösterilir.

"Gelişime Açık KR" sayacı %59 ve **altındaki** key result'ları sayar.

Renk hiçbir yerde tek başına anlam taşımaz — her zaman yanında metin etiketi vardır.`,
      en: `The Performance Management Process Scoring Table, first match from the top:

\`101–130\` Exceeds expectations · \`80–100\` Meets expectations · \`60–79\` Below expectations · \`1–59\` Needs development · \`0%\` Not started

0% is not in the scoring table itself; it is shown as "Not started" to tell a key result with no data yet apart from genuinely low performance.

The "Needs development" counter counts key results at 59% **and below**.

Colour never carries meaning on its own anywhere — there is always a text label next to it.`,
    },
  ),
  entry(
    'yerlesim',
    'basics',
    {
      tr: 'Hero, Kokpit ve Odak arasındaki fark ne?',
      en: 'What is the difference between Hero, Cockpit and Focus?',
    },
    {
      tr: `Performans Özeti'nin aynı içeriğini farklı sırayla dizer:

**Hero** — şirket hedefi panosu üstte, sonra KPI'lar, bölümler, grafikler.

**Kokpit** — grafikler önce; sayılara bakmak isteyene.

**Odak** — müdahale gereken key result'lar en üstte; haftalık toplantı için.

Seçiminiz tarayıcınızda saklanır, diğer kullanıcıları etkilemez. **Kompakt** düğmesi de tablo satırlarını sıkıştırır.`,
      en: `They lay out the same Performance Overview content in a different order:

**Hero** — the company goal panel on top, then KPIs, departments, charts.

**Cockpit** — charts first; for people who want to look at the numbers.

**Focus** — key results needing action at the very top; for the weekly meeting.

Your choice is saved in your browser and does not affect other users. The **Compact** button also tightens the table rows.`,
    },
  ),

  /* --------------------------------- okr -------------------------------- */
  entry(
    'objective-olustur',
    'okr',
    {
      tr: 'Yeni objective nasıl açılır?',
      en: 'How do I create a new objective?',
    },
    {
      tr: `Sol menüden **+ Yeni Objective**. İki adım var:

**1. Objective** — adı, bölümü ve sorumlusunu seçin. Ad alanının altında canlı bir ipucu var: çok kısa yazarsanız "ne değişecek?" diye uyarır, sonuç odaklı bir ad yazınca yeşile döner.

**2. Key Results** — 1 ile 5 arası key result. Her biri için başlangıç, hedef, birim ve sorumlu girin.

Objective her zaman **o an açık olan döneme** yazılır. Topbar'daki tarih aralığı filtresi hangi verilerin görüntülendiğini değiştirir, yeni objective'in hangi döneme gideceğini değiştirmez — geçmiş bir aralık seçili olsa bile sihirbaz açık dönemi kullanır.`,
      en: `**+ New objective** in the left menu. There are two steps:

**1. Objective** — choose the name, department and owner. A live hint under the name field warns "what will change?" if you write too little, and turns green once the name is outcome-oriented.

**2. Key Results** — 1 to 5 key results. For each, enter the start, target, unit and owner.

The objective always goes into **the period that is open right now**. The date range filter in the topbar changes which data you see, not which period the new objective goes into — even with a past range selected, the wizard uses the open period.`,
    },
  ),
  entry(
    'gecmis-veri',
    'okr',
    {
      tr: 'Geçmiş bir döneme yeni objective açabilir miyim?',
      en: 'Can I create a new objective in a past period?',
    },
    {
      tr: `Hayır. Yeni objective'ler her zaman **o an açık olan döneme** yazılır; topbar'da geçmişe dönük bir tarih aralığı seçili olması bunu değiştirmez. Kapalı bir dönemi geriye dönük doldurma sihirbazı artık yok — bu bilinçli bir ürün kararı.

Kapalı bir döneme ait, zaten var olan bir objective'in key result'larını görüntüleyebilirsiniz, ama **Güncel** değerini artık buradan düzeltemezsiniz: objective sayfasındaki **Düzenle**, key result'ın başlangıcını, hedefini, birimini, toplama kuralını ve sorumlusunu değiştirir — **Güncel** salt okunurdur, çünkü artık aylık kayıtlardan türetilen bir özettir, elle yazılan bir alan değil (bkz. "Aylık veri girişi nedir, nerede kullanılır?"). Gerçek figürü düzeltmenin yolu **Aylık Veri Girişi** ekranıdır, ama o ekran da yalnızca **açık** dönemin aylarını listeler — kapalı bir döneme ait bir key result oraya gidip bulunamaz. Sonuç olarak kapalı bir dönemin ölçülen değeri şu an arayüzden düzeltilemez; bkz. "Key result değerini değiştirmek için check-in mi, aylık giriş mi, düzenleme mi?".`,
      en: `No. New objectives always go into **the period that is open right now**; having a past date range selected in the topbar does not change that. There is no longer a wizard for back-filling a closed period — this is a deliberate product decision.

You can view the key results of an existing objective in a closed period, but you can no longer correct its **Current** value there: **Edit** on the objective page changes a key result's start, target, unit, rollup rule and owner — **Current** is read-only, because it is now a summary derived from the monthly entries, not a field typed by hand (see "What is monthly data entry and where is it used?"). The way to correct the real figure is the **Monthly Data Entry** screen, but that screen only lists the months of the **open** period — a key result from a closed period cannot be found there. So the measured value of a closed period cannot currently be corrected from the interface; see "Check-in, monthly entry or edit: which one changes a key result's value?".`,
    },
  ),
  entry(
    'objective-duzenle',
    'okr',
    {
      tr: "Bir objective'i nasıl düzenlerim veya silerim?",
      en: 'How do I edit or delete an objective?',
    },
    {
      tr: `Objective'in kendi sayfasına gidin (bölüm ekranından başlığa tıklayarak), üstte **Düzenle** ve **Sil** düğmeleri var.

**Düzenle** ile objective adını, sorumlusunu ve tüm key result'ları değiştirebilirsiniz — mevcut olanları güncelleyebilir, yenisini ekleyebilir, çıkarabilirsiniz.

**Sil geri alınamaz.** Onay kutusu, silmenin kaç key result ve kaç check-in kaydını da götüreceğini söyler. Devam etmeden okuyun.`,
      en: `Go to the objective's own page (click its title on the department screen); the **Edit** and **Delete** buttons are at the top.

With **Edit** you can change the objective's name, its owner and all its key results — update existing ones, add new ones, remove some.

**Delete cannot be undone.** The confirmation box tells you how many key results and check-in records will go with it. Read it before you continue.`,
    },
  ),
  entry(
    'sorumlu',
    'okr',
    {
      tr: '"Sorumlu" ne anlama geliyor? Giriş yapmayan biri sorumlu olabilir mi?',
      en: 'What does "Owner" mean? Can someone who does not sign in be an owner?',
    },
    {
      tr: `Evet, olabilir — zaten çoğunlukla öyledir.

Sorumlu, bir sonuçtan kim hesap veriyor demektir; programı kullanıp kullanmadığından bağımsızdır. **Personel** rolündeki kişiler tam bu iş için vardır: adları sorumlu olarak görünür, parolaları yoktur, giriş yapamazlar.

Objective için bir sorumlu seçersiniz; her key result için ayrıca farklı bir sorumlu atayabilirsiniz. Key result'ta boş bırakırsanız objective'in sorumlusunu devralır.

Pasifleştirilen kişiler yeni atama listesinde çıkmaz, ama mevcut atamaları bozulmaz.`,
      en: `Yes — in fact that is usually the case.

The owner is the person accountable for a result, whether or not they use the app. People with the **Staff** role exist exactly for this: their names appear as owners, they have no password and cannot sign in.

You choose one owner for the objective, and you can assign a different owner to each key result. If you leave it blank on a key result, it takes the objective's owner.

Deactivated people do not appear in the list for new assignments, but their existing assignments stay intact.`,
    },
  ),
  entry(
    'kr-degistirme',
    'okr',
    {
      tr: 'Key result değerini değiştirmek için check-in mi, aylık giriş mi, düzenleme mi?',
      en: "Check-in, monthly entry or edit: which one changes a key result's value?",
    },
    {
      tr: `Üçünün de amacı farklı:

**Check-in** haftalık ölçümdür. Denetim izi bırakır: kim, ne zaman, hangi değerden hangi değere, hangi notla. İçinde bulunduğunuz ayın kaydını yazar. Rutin, "bu hafta ne oldu" güncellemeleri için bunu kullanın.

**Aylık Veri Girişi** ekranı açık dönemin herhangi bir ayının kaydını yazar veya düzeltir — bkz. "Aylık veri girişi nedir, nerede kullanılır?". Check-in'den farkı: denetim izi bırakmaz, hangi ayı düzelttiğinizi siz seçersiniz. Geçmiş bir ayı unutmuşsanız veya yanlış girmişseniz buradan düzeltin.

**Düzenle** artık **Güncel**'i hiç değiştirmez — objective sayfasındaki bu form başlangıcı, hedefi, birimi, toplama kuralını ve sorumluyu düzeltmek içindir. Yanlış girilmiş bir hedefi veya yazım hatasını düzeltmek için kullanın, gerçek ölçüm değerini değil.

Kısaca: bu hafta gerçekten bir şey ölçüldüyse check-in, geçmiş bir ayın kaydı eksik veya yanlışsa Aylık Veri Girişi, hedef/başlangıç/kural gibi bir tanım hatası varsa Düzenle.`,
      en: `Each has a different purpose:

**Check-in** is the weekly measurement. It leaves an audit trail: who, when, from which value to which, with what note. It writes the entry for the current month. Use it for routine "what happened this week" updates.

The **Monthly Data Entry** screen writes or corrects the entry for any month of the open period — see "What is monthly data entry and where is it used?". Unlike a check-in, it leaves no audit trail, and you choose which month you are correcting. If you forgot a past month or entered it wrong, fix it here.

**Edit** no longer changes **Current** at all — this form on the objective page is for correcting the start, target, unit, rollup rule and owner. Use it to fix a mistyped target or a typo, not the real measured value.

In short: if something was actually measured this week, check-in; if a past month's entry is missing or wrong, Monthly Data Entry; if there is a definition mistake such as target, start or rule, Edit.`,
    },
  ),
  entry(
    'toplama-kurali',
    'okr',
    {
      tr: "Bir key result'ın toplama kuralı (Toplam / Ortalama / Son değer) ne anlama geliyor?",
      en: "What does a key result's rollup rule (Sum / Average / Last value) mean?",
    },
    {
      tr: `Bir key result'ın ay ay girilen değerlerinin tek bir dönem figürüne nasıl indirgeneceğini belirler. Üç seçenek var:

**Toplam** — aylar toplanır. Hasta sayısı, lead sayısı, ciro gibi biriken metrikler için.

**Ortalama** — aylar ortalanır, ama yalnızca **dolu** aylar üzerinden — on iki aylık bir dönemde üç ay veri varsa ortalama üçe bölünür, on ikiye değil. Skor, anket ve oran gibi metrikler için.

**Son değer** — en son girilen ayın değeri geçerli olur. Yıllık ölçümler ve aşamalı işler için (bir projenin hangi fazda olduğu gibi).

Kural her key result için ayrı ayrı, objective sayfasındaki **Düzenle**'de **Kural** açılır menüsünden değiştirilir. Kuralı değiştirmek key result'ın mevcut aylık kayıtlarını silmez — sadece o kayıtları yeni kuralla yeniden topladığı için **Güncel** değeri anında değişebilir. Boş bırakılan bir ayın bu toplamı nasıl etkilediği kurala göre değişir — bkz. "Bir ayı boş bırakırsam key result'ın rakamı ne olur?".`,
      en: `It decides how a key result's month-by-month values are reduced to a single figure for the period. There are three options:

**Sum** — the months are added up. For metrics that accumulate, such as patient count, lead count or revenue.

**Average** — the months are averaged, but only over the **filled** months — in a twelve-month period with data for three months, the average divides by three, not twelve. For metrics such as scores, surveys and ratios.

**Last value** — the value of the most recently entered month applies. For yearly measurements and staged work (such as which phase a project is in).

The rule is set per key result, from the **Rule** dropdown under **Edit** on the objective page. Changing the rule does not delete the key result's existing monthly entries — it only rolls them up again under the new rule, so the **Current** value can change straight away. How a month left blank affects this figure depends on the rule — see "If I leave a month blank, what happens to the key result's figure?".`,
    },
  ),

  /* ------------------------------- checkin ------------------------------ */
  entry(
    'checkin-nasil',
    'checkin',
    {
      tr: 'Check-in nasıl yapılır?',
      en: 'How do I do a check-in?',
    },
    {
      tr: `Topbar'daki **✓ Check-in** düğmesi. İki ekran:

**1.** Hangi key result? Liste **en uzun süredir güncellenmemişi en üste** koyar, bir haftadan eskiler sarıyla işaretlenir — haftalık rutin böylece en çok ihmal edilenden başlar.

**2.** Yeni değeri girin, güven seviyesini seçin, notu yazın. Kaydetmeden önce yeni ilerlemenin ne olacağını canlı gösterir.

Not alanı isteğe bağlı ama değerli: "bu hafta ne oldu, önümüzdeki hafta ne yapılacak" sorusunun cevabı sonradan kimsenin aklında kalmıyor.`,
      en: `The **✓ Check-in** button in the topbar. Two screens:

**1.** Which key result? The list puts **the one not updated for the longest at the top**, and those older than a week are marked in yellow — so the weekly routine starts with the most neglected.

**2.** Enter the new value, choose the confidence level, write a note. Before you save, it shows live what the new progress will be.

The note is optional but valuable: nobody remembers later the answer to "what happened this week, what is next?".`,
    },
  ),
  entry(
    'guven',
    'checkin',
    {
      tr: 'Güven seviyesi ne için?',
      en: 'What is the confidence level for?',
    },
    {
      tr: `Sayının anlatmadığını anlatır. Bir key result %70'te olabilir ama sahibi hedefe ulaşılamayacağını biliyordur — güven seviyesi bunu görünür kılar.

**Yüksek** hedefe ulaşılacak · **Orta** belirsiz · **Düşük** müdahale gerekiyor.

Yönetici Raporu'nda ilerlemeyle birlikte görünür. Yüzdesi iyi ama güveni düşük bir key result, yüzdesi kötü olandan daha acil olabilir.`,
      en: `It says what the number does not. A key result can be at 70% while its owner knows the target will not be reached — the confidence level makes that visible.

**High** the target will be reached · **Medium** uncertain · **Low** action needed.

It appears next to progress in the Executive Report. A key result with a good percentage but low confidence can be more urgent than one with a poor percentage.`,
    },
  ),
  entry(
    'checkin-gecmisi',
    'checkin',
    {
      tr: 'Check-in geçmişini görebilir miyim?',
      en: 'Can I see the check-in history?',
    },
    {
      tr: `Kayıtlar tutuluyor — her check-in önceki değeri, yeni değeri, yazarı, tarihi ve notu saklıyor.

Ancak şu an bunu gösteren bir ekran **yok**. Veri duruyor, arayüzü henüz yapılmadı. İhtiyaç duyarsanız eklenebilir.`,
      en: `The records are kept — every check-in stores the previous value, the new value, the author, the date and the note.

But there is **no** screen that shows them yet. The data is there; the interface has not been built. It can be added if you need it.`,
    },
  ),

  /* ------------------------------- periods ------------------------------ */
  entry(
    'mali-yil',
    'periods',
    {
      tr: 'Mali yıl hangi aylara denk geliyor?',
      en: 'Which months does the fiscal year cover?',
    },
    {
      tr: `Mali yıl **Eylül**'de başlar ve koddaki yıl, mali yılın *başladığı* yıldır: \`2026-FY\` = 1 Eylül 2026 – 31 Ağustos 2027. Şirketin objective'leri bu döngüye bağlıdır — dönem seçicideki **Mali yıl başından bugüne** ve **Geçen mali yıl** seçenekleri de aynı sınırı kullanır.

Dikkat edilecek nokta: Ağustos 2026 hâlâ \`2025-FY\`'nin içindedir, \`2026\` etiketli hiçbir dönemde değildir.

Sistem çeyrek ve ay uzunluğunda dönemleri de tanır — kodları sırasıyla \`2026-Q3\` ve \`2026-08\` biçimindedir — ama **Yönetim → Dönemler** ekranındaki formdan yalnızca mali yıl oluşturulabilir; bu ölçekte bir bölünmeye ihtiyaç duyulursa geliştirici tarafından elle eklenir.`,
      en: `The fiscal year starts in **September**, and the year in the code is the year the fiscal year *starts*: \`2026-FY\` = 1 September 2026 – 31 August 2027. The company's objectives follow this cycle — the **Fiscal year to date** and **Previous fiscal year** options in the period picker use the same boundary.

Watch out: August 2026 is still inside \`2025-FY\`, not in any period labelled \`2026\`.

The system also recognises quarter- and month-long periods — their codes look like \`2026-Q3\` and \`2026-08\` respectively — but the form on the **Admin → Periods** screen can only create fiscal years; if a split at that scale is needed, a developer adds it by hand.`,
    },
  ),
  entry(
    'donem-degistir',
    'periods',
    {
      tr: 'Hangi tarih aralığına baktığımı nasıl değiştirebilirim?',
      en: 'How do I change the date range I am looking at?',
    },
    {
      tr: `Topbar'daki **tarih aralığı** seçicisi. Hazır seçenekler var — **Mali yıl başından bugüne**, **Bu dönem**, **Geçen mali yıl** — ya da **Özel aralık…** ile başlangıç ve bitiş tarihini kendiniz girebilirsiniz.

Seçim adres satırına yazılır (\`?from=2025-09-01&to=2026-08-31\`), yani bağlantıyı kopyalayıp paylaşabilirsiniz — karşı taraf aynı aralığı görür. Eski \`?period=2025-Q1\` biçimindeki bağlantılar da hâlâ çalışır, o dönemin tarihlerine karşılık gelir.

Seçtiğiniz aralık bir veya birden fazla dönemi kapsayabilir; ekranlar o aralığa denk gelen tüm dönemlerin verisini birleştirip gösterir. Ekranlar arasında gezinirken seçtiğiniz aralık korunur.`,
      en: `The **date range** picker in the topbar. There are presets — **Fiscal year to date**, **This period**, **Previous fiscal year** — or you can enter the start and end dates yourself with **Custom range…**.

The selection is written to the address bar (\`?from=2025-09-01&to=2026-08-31\`), so you can copy and share the link — the other person sees the same range. Older links in the \`?period=2025-Q1\` form still work too; they map to that period's dates.

The range you choose can cover one or more periods; the screens combine the data of every period that falls in that range. The range is kept as you move between screens.`,
    },
  ),
  entry(
    'kesit-anlami',
    'periods',
    {
      tr: 'Tarih aralığındaki "başlangıç" ve "bitiş" tam olarak ne anlama geliyor?',
      en: 'What exactly do "from" and "to" mean in the date range?',
    },
    {
      tr: `Aralığın **bitişi** bir kesit tarihidir: bu aralığı kullanan ekranların (Performans Özeti, Yönetici Raporu, Bölüm ve Objective ekranları, sol menüdeki bölüm yüzdeleri) ana rakamı, o tarihe kadar ölçülmüş durumu gösterir — dönemin kendi başlangıcından itibaren birikmiş olarak. Bitişi geçmişe çekmek geçmişteki bir kesite bakmak demektir, bugüne çekmek en güncel duruma bakmak demektir. Bitiş **bugünden ileri** bir tarihe ayarlanırsa (örneğin "Bu dönem" seçeneği, dönem sonu henüz gelmemişken) kesit bugüne çekilir; henüz yaşanmamış bir ay için "o tarihe kadarki durum" diye bir şey yoktur. **Aylık Veri Girişi** ve **Yönetim** ekranları bu kesite bakmaz; onlar her zaman açık dönemin kendi haline bakar.

Her ekrandan açabildiğiniz **check-in** penceresi de bu kesite bakmaz: orada bir key result'ın kayıtlı özet değeri görünür, yani girilmiş tüm ayları kapsayan güncel rakam. Geçmişe çekilmiş bir kesitte, arkadaki satır ile check-in penceresi farklı bir "güncel" değer gösterebilir; bu beklenen bir durumdur, çünkü check-in her zaman bugünün rakamı üzerine yazılır.

Aralığın **başlangıcı** farklı bir işe yarar: hangi dönemlerin bu aralığa dahil olacağını belirler, aralığı kesen her dönem listeye girer. Bir dönemin **içinde** başlangıcı ileri veya geri kaydırmak hiçbir rakamı değiştirmez — figürler her zaman kendi döneminin ilk ayından hesaplanır, aralığın başlangıcından değil. Başlangıç yalnızca bir dönemi aralığın tamamen dışına itecek kadar kaydığında fark yaratır; o zaman o dönem tüm ana rakamlardan düşer — ve Performans Özeti'nin **Hero** yerleşiminde en üstteki karttaki dönem etiketinden (örn. "2026-FY") de düşer; bu etiket yalnızca o yerleşimde görünür, Kokpit ve Odak yerleşimlerinde hiç çizilmez. Tarih aralığı seçicisinin kendisi bundan etkilenmez — o her zaman aynı hazır seçenekleri listeler, hangi dönemlerin aralığa girdiğine bakmaz.`,
      en: `The **end** of the range is a cutoff date: the headline figure on screens that use the range (Performance Overview, Executive Report, the Department and Objective screens, the department percentages in the left menu) shows the state measured up to that date — accumulated from the start of the period itself. Moving the end into the past means looking at a past cutoff; moving it to today means looking at the latest state. If the end is set **later than today** (for example the "This period" option while the period has not ended yet), the cutoff is pulled back to today; there is no "state up to that date" for a month that has not happened. The **Monthly Data Entry** and **Admin** screens ignore this cutoff; they always look at the open period as it is.

The **check-in** window you can open from any screen ignores the cutoff too: it shows the key result's stored summary value, the current figure covering every month entered. With a cutoff in the past, the row behind it and the check-in window can show a different "current" value; this is expected, because a check-in is always written on top of today's figure.

The **start** of the range does a different job: it decides which periods are included, and every period that overlaps the range is in. Moving the start forward or back **within** a period changes no figure — figures are always calculated from the first month of their own period, not from the start of the range. The start only matters once it moves far enough to push a period completely outside the range; then that period drops out of all headline figures — and out of the period label (e.g. "2026-FY") on the top card of the Performance Overview's **Hero** layout; that label only appears in that layout and is never drawn in the Cockpit and Focus layouts. The date range picker itself is not affected — it always lists the same presets, regardless of which periods fall in the range.`,
    },
  ),
  entry(
    'donem-ekle',
    'periods',
    {
      tr: 'Yeni dönem nasıl eklenir, hangisi "açık" olur?',
      en: 'How do I add a new period, and which one is "open"?',
    },
    {
      tr: `**Yönetim → Dönemler**. Kod \`2027-FY\` biçiminde olmalı (mali yıl), başlangıç ve bitiş tarihini girin. Yeni dönem *Planlandı* olarak açılır.

Bir dönemi **Aktif** yapmak, diğer aktif dönemi otomatik olarak kapatır — türü ne olursa olsun, uygulama tek bir açık döngüye göre açıldığı için aynı anda iki açık dönem olamaz.

Tarih yanlış girildiyse aynı tabloda **Tarihleri düzenle** ile düzeltilir. Dönem **kodu** değiştirilemez; her yerde o dönemi tanımlar.`,
      en: `**Admin → Periods**. The code must be in the \`2027-FY\` form (fiscal year); enter the start and end dates. The new period starts as *Planned*.

Making a period **Active** automatically closes the other active period — whatever its type, there cannot be two open periods at once, because the app opens on a single open cycle.

If a date was entered wrong, fix it with **Edit dates** in the same table. A period's **code** cannot be changed; it identifies that period everywhere.`,
    },
  ),
  entry(
    'aylik-yok',
    'periods',
    {
      tr: 'Sadece Temmuz ayına bakabilir miyim?',
      en: 'Can I look at July on its own?',
    },
    {
      tr: `Hayır, ama "hayır" artık farklı bir sebepten: Bölüm, Rapor ve Performans Özeti ekranlarının ana rakamları, tarih aralığının **bitişini** bir kesit tarihi olarak okur — figür, dönemin kendi başlangıcından o bitiş tarihine kadar birikmiş durumu gösterir, Temmuz'un kendi başına değerini değil. Aralığı Temmuz sonuna daraltmak bu kesiti değiştirir, ama gösterilen rakam hâlâ dönemin başından Temmuz'a kadarki toplam/ortalama/son değerdir — Temmuz'u tek başına yalıtan bir görünüm yok; bkz. "Tarih aralığındaki 'başlangıç' ve 'bitiş' tam olarak ne anlama geliyor?". Dönemler de bağımsız kovalardır: bir ay, ait olduğu dönemin dışındaki hiçbir objective'i gösteremez.

Ama artık gerçek bir aylık kırılım var — bir key result'ın tek bir "güncel" değeri değil, ay ay girilmiş kayıtları da tutuluyor. Bunu iki yerde görürsünüz: **Aylık Veri Girişi** ekranı tek bir ayın kendi kaydını gösterir (bkz. bir sonraki soru); Performans Özeti'ndeki şirket eğilim grafiği ay ay nokta çizer, ama her nokta o aya kadarki *birikimli* rakamdır, o ayın tek başına değeri değil.`,
      en: `No, but the "no" now has a different reason: the headline figures on the Department, Report and Performance Overview screens read the **end** of the date range as a cutoff date — the figure shows the state accumulated from the start of the period up to that end date, not July's value on its own. Narrowing the range to the end of July moves this cutoff, but the figure shown is still the sum/average/last value from the start of the period up to July — there is no view that isolates July by itself; see "What exactly do 'from' and 'to' mean in the date range?". Periods are also separate buckets: a month cannot show any objective outside the period it belongs to.

But there is now a real monthly breakdown — a key result keeps not just a single "current" value but also its month-by-month entries. You see it in two places: the **Monthly Data Entry** screen shows a single month's own entry (see the next question); the company trend chart on the Performance Overview plots a point per month, but each point is the *cumulative* figure up to that month, not that month's value on its own.`,
    },
  ),
  entry(
    'aylik-giris',
    'periods',
    {
      tr: 'Aylık veri girişi nedir, nerede kullanılır?',
      en: 'What is monthly data entry and where is it used?',
    },
    {
      tr: `Sol menüdeki **Veri Girişi** — yalnızca check-in yetkisi olanlara görünür (bugünkü rol düzeninde bu sadece **Yönetici**); Üst Yönetim salt okur olduğu için bu bağlantıyı görmez.

Ekran tek seferde bir ayı gösterir, ay seçiciden değiştirebilirsiniz — ama sadece **açık** dönemin ayları arasından. Kapalı veya planlanmış bir dönemin ayları burada hiç listelenmez ve buradan doldurulamaz.

Her key result kendi satırında, hedefiyle ve toplama kuralıyla birlikte listelenir — bkz. "Bir key result'ın toplama kuralı (Toplam / Ortalama / Son değer) ne anlama geliyor?". Boş bırakılan bir değer alanı **"girilmedi"** demektir, sıfır değil; gerçekten sıfır ölçtüyseniz \`0\` yazmanız gerekir. **Kaydet** yalnızca o oturumda değiştirdiğiniz satırları tek seferde yazar; dokunmadığınız satırlar olduğu gibi kalır.`,
      en: `**Data Entry** in the left menu — visible only to people allowed to check in (with today's roles that is only **Admin**); Executives are read-only, so they do not see this link.

The screen shows one month at a time, and you can switch it with the month picker — but only among the months of the **open** period. Months of a closed or planned period are not listed here at all and cannot be filled in from here.

Each key result is listed on its own row, with its target and rollup rule — see "What does a key result's rollup rule (Sum / Average / Last value) mean?". A value field left blank means **"not entered"**, not zero; if you genuinely measured zero, you need to type \`0\`. **Save** writes only the rows you changed in that session, all at once; rows you did not touch stay as they are.`,
    },
  ),
  entry(
    'ay-bos',
    'periods',
    {
      tr: "Bir ayı boş bırakırsam key result'ın rakamı ne olur?",
      en: "If I leave a month blank, what happens to the key result's figure?",
    },
    {
      tr: `Kurala göre değişir:

**Son değer** kuralındaki bir key result, en son ölçüldüğü ayın değerini kesite kadarki boş aylar boyunca taşır — dönem içinde daha yeni bir ay boşsa rakam değişmez, en son dolu ayın değeri geçerliliğini sürdürür. Bu, kesitten aylar önce ölçülmüş bir rakamın hâlâ gösterilebileceği anlamına gelir.

Ekran bunu gizlemez: hangi ayda ölçüldüğü, figürün yanında **"son veri: Eyl 2025"** gibi bir işaretle gösterilir. Bu sadece **Son değer** kuralına özel değil — en son dolu ayı kesitten önce kalan her key result'ta aynı şekilde çalışır, **Toplam** ve **Ortalama** dahil. İşaret Bölüm ve Objective ekranlarındaki tablo satırında ve Performans Özeti'nin "Dikkat" listesinde görünür; Yönetici Raporu bu işareti göstermez, rakamı aynı kurallarla hesaplasa da.

**Toplam** ve **Ortalama** kurallarında taşıma yoktur — boş ay basitçe hesaba katılmaz: toplama eklenmez, ortalamanın paydasına girmez.

Ayrım burada iki farklı duruma göre yapılır. Bir key result'ın **hiç** aylık kaydı yoksa (aylık veri girişi hiç kullanılmamışsa) key result'ın özet **Güncel** değeri gösterilir ve ortalamalara normal şekilde girer. Ama aylık kayıtları varsa ve kesite kadar hiçbiri dolu değilse, key result kendi **başlangıç** değerinde görünür, sıfır değil — ve bu sefer ortalamalardan **dışlanır**; bkz. "Kesite göre ölçülmemiş bir key result ortalamalara nasıl giriyor?".

Bunun aylık veri girişi ekranının kendisiyle bir ilgisi yok — o ekran her zaman o ayın kendi ham kaydını gösterir, boşsa boş kalır. Yukarıdaki kurallar, bir key result'ın figürü bir tarih aralığına göre hesaplanırken devreye girer: Bölüm, Rapor, Performans Özeti'nin ana rakamlarında ve şirket eğilim grafiğinde.`,
      en: `It depends on the rule:

A key result on the **Last value** rule carries the value of the month it was last measured through the blank months up to the cutoff — if a more recent month in the period is blank, the figure does not change; the last filled month's value still applies. This means a figure measured months before the cutoff can still be shown.

The screen does not hide this: the month it was measured in is shown next to the figure with a marker such as **"last data: Sep 2025"**. This is not specific to the **Last value** rule — it works the same for every key result whose last filled month is before the cutoff, **Sum** and **Average** included. The marker appears on the table row in the Department and Objective screens and in the "Attention" list on the Performance Overview; the Executive Report does not show it, even though it calculates the figure with the same rules.

The **Sum** and **Average** rules carry nothing over — a blank month is simply left out: it is not added to the sum and does not count in the average's denominator.

Two different cases are told apart here. If a key result has **no** monthly entries at all (monthly data entry was never used), its summary **Current** value is shown and counts in the averages as normal. But if it has monthly entries and none of them is filled up to the cutoff, the key result shows at its own **start** value, not zero — and this time it is **left out** of the averages; see "How does a key result not measured by the cutoff count in averages?".

None of this concerns the monthly data entry screen itself — that screen always shows the month's own raw entry, and a blank stays blank. The rules above apply when a key result's figure is calculated for a date range: in the headline figures of the Department, Report and Performance Overview screens, and in the company trend chart.`,
    },
  ),
  entry(
    'olculmemis-kr-ortalama',
    'periods',
    {
      tr: 'Kesite göre ölçülmemiş bir key result ortalamalara nasıl giriyor?',
      en: 'How does a key result not measured by the cutoff count in averages?',
    },
    {
      tr: `Girmiyor — hariç tutulur. Bir key result'ın aylık kayıtları var ama kesite kadar hiçbiri dolu değilse (bkz. "Bir ayı boş bırakırsam key result'ın rakamı ne olur?"), o key result objective, bölüm ve şirket ortalamalarının hiçbirine katılmaz. Sıfır olarak da sayılmaz: sıfır "ölçüldü ve ilerleme yok" demek olurdu, oysa asıl durum "bu kesitte henüz ölçülmedi".

Performans Özeti'ndeki **ölçülen KR** sayacı bu ayrımı gösterir: kesite kadar gerçekten ölçülmüş olan key result sayısı ile toplam key result sayısını yan yana verir (örn. \`42/63 ölçülen KR\`). İkisi eşitse sayaç hiç görünmez — o zaman hariç tutulan bir key result yoktur. Hiçbir aylık kaydı olmayıp özet **Güncel** değerini koruyan key result'lar (bkz. "Bir ayı boş bırakırsam key result'ın rakamı ne olur?") bu sayaçta ölçülmüş sayılır — hariç tutulan yalnızca kaydı olup kesite kadar boş kalanlardır.`,
      en: `It does not — it is left out. If a key result has monthly entries but none of them is filled up to the cutoff (see "If I leave a month blank, what happens to the key result's figure?"), that key result is left out of the objective, department and company averages. It is not counted as zero either: zero would mean "measured, and no progress", when the real situation is "not measured yet at this cutoff".

The **measured KRs** counter on the Performance Overview shows this split: it puts the number of key results actually measured up to the cutoff next to the total number of key results (e.g. \`42/63 measured KRs\`). If the two are equal, the counter does not appear at all — then no key result is left out. Key results with no monthly entries at all that keep their summary **Current** value (see "If I leave a month blank, what happens to the key result's figure?") count as measured here — only those that have entries but are blank up to the cutoff are left out.`,
    },
  ),

  /* -------------------------------- admin ------------------------------- */
  entry(
    'kullanici-ekle',
    'admin',
    {
      tr: 'Yeni kullanıcı veya personel nasıl eklenir?',
      en: 'How do I add a new user or staff member?',
    },
    {
      tr: `**Yönetim → Kullanıcılar**. Ad, e-posta, rol ve bölüm girin.

Rol **Yönetici** veya **Üst Yönetim** ise parola alanı çıkar — en az 12 karakter. Parolayı siz belirler ve kişiye kendiniz iletirsiniz; sistem e-posta göndermez.

Rol **Personel** ise parola alanı çıkmaz. Bu kişi giriş yapamaz, yalnızca sorumlu olarak görünür.`,
      en: `**Admin → Users**. Enter the name, email, role and department.

If the role is **Admin** or **Executive**, a password field appears — at least 12 characters. You set the password and pass it on to the person yourself; the system does not send email.

If the role is **Staff**, no password field appears. This person cannot sign in and only appears as an owner.`,
    },
  ),
  entry(
    'kullanici-sil',
    'admin',
    {
      tr: 'Bir kişiyi neden silemiyorum?',
      en: "Why can't I delete a person?",
    },
    {
      tr: `O kişi bir objective, key result veya check-in kaydında sorumlu görünüyorsa silinmez. Silmek performans geçmişini de götürürdü.

Bunun yerine **Pasifleştir**. Kişi listede kalır, mevcut atamaları korunur, yeni atama listelerinde çıkmaz ve giriş yapamaz.

Hiçbir kayıtta görünmeyen kişiler silinebilir.

Ayrıca kendinizi silemez veya pasifleştiremezsiniz, son yönetici hesabını da düşüremezsiniz — kimsenin kalmadığı bir sistem oluşmasın diye.`,
      en: `If the person appears as owner on an objective, key result or check-in record, they cannot be deleted. Deleting them would take the performance history with them.

Use **Deactivate** instead. The person stays in the list, their existing assignments are kept, they do not appear in lists for new assignments, and they cannot sign in.

People who do not appear in any record can be deleted.

You also cannot delete or deactivate yourself, or remove the last admin account — so the system is never left with nobody to run it.`,
    },
  ),
  entry(
    'bolum-ekle',
    'admin',
    {
      tr: 'Bölüm nasıl eklenir, silinir, sırası değiştirilir?',
      en: 'How do I add, delete or reorder departments?',
    },
    {
      tr: `**Yönetim → Bölümler**. Emoji, Türkçe ad, İngilizce ad ve kısa ad girip **Ekle**.

**Kısa ad** adres satırında görünür (\`/bolum/kisa-ad\`) ve **sonradan değiştirilemez** — değişse tüm bağlantılar kırılırdı. Yalnızca küçük harf, rakam ve tire kullanın.

**↑ ↓** düğmeleri sol menüdeki sırayı değiştirir.

Bir bölüm objective barındırdığı sürece **silinemez**; silmek o bölümün tüm performans geçmişini götürürdü. Önce objective'leri kaldırın. Bölüme bağlı kişiler silinmez, yalnızca bölüm alanları boşaltılır.`,
      en: `**Admin → Departments**. Enter an emoji, the Turkish name, the English name and a short name, then **Add**.

The **short name** appears in the address bar (\`/bolum/short-name\`) and **cannot be changed later** — changing it would break every link. Use only lowercase letters, digits and hyphens.

The **↑ ↓** buttons change the order in the left menu.

A department **cannot be deleted** while it has objectives; deleting it would take that department's whole performance history with it. Remove the objectives first. People linked to the department are not deleted; only their department field is cleared.`,
    },
  ),

  /* ------------------------------- account ------------------------------ */
  entry(
    'parola-degistir',
    'account',
    {
      tr: 'Kendi parolamı nasıl değiştiririm?',
      en: 'How do I change my own password?',
    },
    {
      tr: `Sol menünün altındaki adınıza tıklayın — **Hesabım** ekranı açılır.

Mevcut parolanız oturumunuz açık olsa bile sorulur. Bu bilinçli: açık bırakılmış bir tarayıcı kalıcı bir devralmaya dönüşmesin diye.

Yeni parola en az 12 karakter olmalı ve eskisinden farklı olmalı.`,
      en: `Click your name at the bottom of the left menu — the **My account** screen opens.

You are asked for your current password even though you are signed in. This is deliberate: so that a browser left signed in cannot turn into a permanent takeover.

The new password must be at least 12 characters and different from the old one.`,
    },
  ),
  entry(
    'parola-unuttum',
    'account',
    {
      tr: 'Parolamı unuttum, ne yapmalıyım?',
      en: 'I forgot my password. What should I do?',
    },
    {
      tr: `"Şifremi unuttum" bağlantısı yok — sistem e-posta göndermiyor. Sıralı çözüm:

**1.** Bir yöneticiye ulaşın. **Yönetim → Kullanıcılar**'da satırınızdaki **Parola** düğmesiyle yeni parolanızı belirler ve size iletir. Sonra **Hesabım**'dan kendiniz değiştirin.

**2.** Bütün yöneticiler parolasını unuttuysa kimse kimseyi kurtaramaz. O durumda veritabanına erişimi olan kişi \`npm run set-password\` komutunu çalıştırır.

Bu yüzden **en az iki yönetici hesabı tutun.**`,
      en: `There is no "Forgot password" link — the system does not send email. In order:

**1.** Contact an admin. In **Admin → Users**, they set a new password with the **Password** button on your row and pass it on to you. Then change it yourself from **My account**.

**2.** If every admin has forgotten their password, nobody can rescue anybody. In that case someone with access to the database runs \`npm run set-password\`.

That is why you should **keep at least two admin accounts.**`,
    },
  ),
  entry(
    'kilitlendim',
    'account',
    {
      tr: '"Çok fazla başarısız deneme" diyor, ne oldu?',
      en: 'It says "Too many failed attempts". What happened?',
    },
    {
      tr: `Aynı e-posta için 15 dakika içinde 5 başarısız denemeden sonra adres 15 dakika kilitlenir. Bu süre içinde **doğru parola da kabul edilmez**.

Kaba kuvvet denemelerine karşı böyle. Beklemek yeterli; süre dolunca kendiliğinden açılır.

Acele ediyorsanız veritabanına erişimi olan kişi \`npm run unlock\` ile temizleyebilir.`,
      en: `After 5 failed attempts for the same email within 15 minutes, the address is locked for 15 minutes. During that time **even the correct password is refused**.

This protects against brute-force attempts. Waiting is enough; it unlocks by itself when the time is up.

If you are in a hurry, someone with access to the database can clear it with \`npm run unlock\`.`,
    },
  ),
  entry(
    'dil',
    'account',
    {
      tr: 'Arayüz dilini değiştirebilir miyim?',
      en: 'Can I change the interface language?',
    },
    {
      tr: `Evet, iki yerden: giriş ekranındaki **TR | EN** anahtarı ve giriş yaptıktan sonra topbar'ın sağındaki **TR / EN** düğmesi. İkisi aynı ayarı değiştirir. Seçim tarayıcınızda hatırlanır — bir sonraki girişte de aynı dille açılır — ve diğer kullanıcıları etkilemez.

Bölüm adları ve prototipten gelen objective/key result başlıkları iki dilde girilmiştir. Sizin sonradan eklediğiniz kayıtlarda İngilizce alan Türkçesiyle aynı olur — çeviri yapan bir mekanizma yok, sonradan düzenlenebilir. Bu kılavuzdaki ekip notları da yazıldıkları dilde gösterilir.`,
      en: `Yes, in two places: the **TR | EN** switch on the sign-in screen, and the **TR / EN** button on the right of the topbar once you are signed in. Both change the same setting. Your choice is remembered in your browser — the app opens in the same language next time you sign in — and does not affect other users.

Department names and the objective/key result titles that came from the prototype were entered in both languages. In records you add later, the English field is the same as the Turkish one — nothing translates it, but it can be edited afterwards. Team notes in this guide are also shown in the language they were written in.`,
    },
  ),
]

/** Rehber girdilerini kategoriye göre gruplar, kategori sırasını korur. */
export function groupByCategory<T extends { category: HelpCategory }>(
  articles: readonly T[],
): Map<HelpCategory, T[]> {
  const map = new Map<HelpCategory, T[]>()
  for (const a of articles) {
    const list = map.get(a.category)
    if (list) list.push(a)
    else map.set(a.category, [a])
  }
  return map
}
