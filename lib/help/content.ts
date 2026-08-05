import type { HelpArticle, HelpCategory } from './types'

/**
 * The built-in guide.
 *
 * Version-controlled on purpose: these answers describe how the application
 * behaves, so they belong next to the code that behaves that way. Questions a
 * team discovers in daily use go in the `help_articles` table instead, added
 * from the help screen without a deploy.
 *
 * Answers support blank-line paragraphs, `**kalın**` and `` `kod` ``. Nothing
 * else — the same renderer displays admin-written text, so it must stay safe.
 */
const entry = (
  id: string,
  category: HelpCategory,
  question: string,
  answer: string,
): HelpArticle => ({ id: `builtin-${id}`, category, question, answer, source: 'builtin' })

export const BUILTIN_HELP: readonly HelpArticle[] = [
  /* ------------------------------- basics ------------------------------- */
  entry(
    'genel-bakis',
    'basics',
    'Bu program ne işe yarıyor?',
    `Nove'un OKR'larını (Objective ve Key Result) tek yerde takip eder.

Yapı üç katmanlı: **bölüm** → **objective** → **key result**. Bir bölümün ilerlemesi, objective'lerinin ortalaması; bir objective'in ilerlemesi de key result'larının ortalamasıdır. Hepsi ağırlıksız — her key result eşit sayar.

Şirket ilerlemesi de objective'i olan bölümlerin ortalamasıdır. Objective'i olmayan bölüm ortalamaya katılmaz, %0 olarak sayılmaz.`,
  ),
  entry(
    'kimler-kullanir',
    'basics',
    'Programı kimler kullanabiliyor?',
    `Yalnızca İnsan Kaynakları ve Yönetim. Üç rol var:

**Yönetici** — her şeyi yapar: objective açma, check-in, kullanıcı, bölüm ve dönem yönetimi.

**Üst Yönetim** — yalnızca okur. Rapor dahil her şeyi görür, hiçbir şeyi değiştiremez.

**Personel** — programa **giriş yapamaz**. Objective ve key result'larda "sorumlu" olarak adı görünür, parolası yoktur. Bölüm liderleri ve ekip üyeleri bu kategoridedir.`,
  ),
  entry(
    'ilerleme-hesabi',
    'basics',
    'İlerleme yüzdesi nasıl hesaplanıyor?',
    `Başlangıç ve hedef arasındaki mesafenin ne kadarının kapandığına bakılır:

\`ilerleme = (güncel − başlangıç) ÷ (hedef − başlangıç)\`

Bu yüzden **düşürme hedefleri** de doğru çalışır. "Lead maliyetini 950'den 650'ye indir" hedefinde güncel değer 720 ise ilerleme %77'dir — ayrı bir "azalması iyi" işareti gerekmez.

Sonuç %0 ile %140 arasına sıkıştırılır. %0 altı, hedeften uzaklaşmayı negatif çubuk yerine "başlamadı" olarak gösterir; %140 üstü de aşırı aşılmış bir key result'ın üstteki ortalamaları ele geçirmesini engeller.`,
  ),
  entry(
    'durum-renkleri',
    'basics',
    'Durum etiketleri neye göre değişiyor?',
    `Performans Yönetim Süreci Puanlama Tablosu'na göre, yukarıdan aşağı ilk uyan:

\`101–130\` Beklenenin Üzerinde · \`80–100\` Beklenen · \`60–79\` Beklenenin Altında · \`1–59\` Gelişime Açık · \`%0\` Başlamadı

%0 tabloda ayrıca yer almaz; henüz veri girilmemiş bir key result'ı gerçekten düşük performanstan ayırmak için "Başlamadı" olarak gösterilir.

"Gelişime Açık KR" sayacı %59 ve **altındaki** key result'ları sayar.

Renk hiçbir yerde tek başına anlam taşımaz — her zaman yanında metin etiketi vardır.`,
  ),
  entry(
    'yerlesim',
    'basics',
    'Hero, Kokpit ve Odak arasındaki fark ne?',
    `Performans Özeti'nin aynı içeriğini farklı sırayla dizer:

**Hero** — şirket hedefi panosu üstte, sonra KPI'lar, bölümler, grafikler.

**Kokpit** — grafikler önce; sayılara bakmak isteyene.

**Odak** — müdahale gereken key result'lar en üstte; haftalık toplantı için.

Seçiminiz tarayıcınızda saklanır, diğer kullanıcıları etkilemez. **Kompakt** düğmesi de tablo satırlarını sıkıştırır.`,
  ),

  /* --------------------------------- okr -------------------------------- */
  entry(
    'objective-olustur',
    'okr',
    'Yeni objective nasıl açılır?',
    `Sol menüden **+ Yeni Objective**. İki adım var:

**1. Objective** — adı, bölümü ve sorumlusunu seçin. Ad alanının altında canlı bir ipucu var: çok kısa yazarsanız "ne değişecek?" diye uyarır, sonuç odaklı bir ad yazınca yeşile döner.

**2. Key Results** — 1 ile 5 arası key result. Her biri için başlangıç, hedef, birim ve sorumlu girin.

Objective **hangi dönemde açılacağı, topbar'da seçili olan dönemdir.** Geçmiş bir çeyreğe girmek istiyorsanız önce üstten o dönemi seçin.`,
  ),
  entry(
    'gecmis-veri',
    'okr',
    'Geçmiş bir çeyreğe veri nasıl girilir?',
    `Kapalı dönemlere de objective açılabilir, bu yüzden geçmişi doldurmak mümkün.

**1.** Topbar'daki **Dönem** menüsünden geçmiş çeyreği seçin (örneğin \`2025-Q1\`).

**2.** **+ Yeni Objective** — sihirbaz o dönemi kullanır, ekranda \`Dönem\` alanında görürsünüz.

**3.** Key result'larda **Güncel** alanına o çeyrekte ulaşılan değeri yazın. Boş bırakırsanız başlangıç değeri kullanılır, yani %0 görünür.

Her dönem bağımsızdır: \`2025-Q1\`'e veri girmek açık çeyreğin yüzdelerini etkilemez.

Daha eski çeyrek gerekiyorsa (\`2023-Q1\` gibi) önce **Yönetim → Dönemler**'den ekleyin.`,
  ),
  entry(
    'objective-duzenle',
    'okr',
    "Bir objective'i nasıl düzenlerim veya silerim?",
    `Objective'in kendi sayfasına gidin (bölüm ekranından başlığa tıklayarak), üstte **Düzenle** ve **Sil** düğmeleri var.

**Düzenle** ile objective adını, sorumlusunu ve tüm key result'ları değiştirebilirsiniz — mevcut olanları güncelleyebilir, yenisini ekleyebilir, çıkarabilirsiniz.

**Sil geri alınamaz.** Onay kutusu, silmenin kaç key result ve kaç check-in kaydını da götüreceğini söyler. Devam etmeden okuyun.`,
  ),
  entry(
    'sorumlu',
    'okr',
    '"Sorumlu" ne anlama geliyor? Giriş yapmayan biri sorumlu olabilir mi?',
    `Evet, olabilir — zaten çoğunlukla öyledir.

Sorumlu, bir sonuçtan kim hesap veriyor demektir; programı kullanıp kullanmadığından bağımsızdır. **Personel** rolündeki kişiler tam bu iş için vardır: adları sorumlu olarak görünür, parolaları yoktur, giriş yapamazlar.

Objective için bir sorumlu seçersiniz; her key result için ayrıca farklı bir sorumlu atayabilirsiniz. Key result'ta boş bırakırsanız objective'in sorumlusunu devralır.

Pasifleştirilen kişiler yeni atama listesinde çıkmaz, ama mevcut atamaları bozulmaz.`,
  ),
  entry(
    'kr-degistirme',
    'okr',
    'Key result değerini değiştirmek için düzenleme mi, check-in mi?',
    `İkisi de değeri değiştirir, ama amaçları farklı:

**Check-in** haftalık ölçümdür. Denetim izi bırakır: kim, ne zaman, hangi değerden hangi değere, hangi notla. Rutin güncellemeler için bunu kullanın.

**Düzenle** düzeltmedir — yanlış girilmiş bir hedefi, yazım hatasını, geçmiş veriyi toplu girmeyi kapsar. Denetim izi bırakmaz.

Kısaca: gerçekte bir şey ilerlediyse check-in, kaydın kendisi hatalıysa düzenleme.`,
  ),

  /* ------------------------------- checkin ------------------------------ */
  entry(
    'checkin-nasil',
    'checkin',
    'Check-in nasıl yapılır?',
    `Topbar'daki **✓ Check-in** düğmesi. İki ekran:

**1.** Hangi key result? Liste **en uzun süredir güncellenmemişi en üste** koyar, bir haftadan eskiler sarıyla işaretlenir — haftalık rutin böylece en çok ihmal edilenden başlar.

**2.** Yeni değeri girin, güven seviyesini seçin, notu yazın. Kaydetmeden önce yeni ilerlemenin ne olacağını canlı gösterir.

Not alanı isteğe bağlı ama değerli: "bu hafta ne oldu, önümüzdeki hafta ne yapılacak" sorusunun cevabı sonradan kimsenin aklında kalmıyor.`,
  ),
  entry(
    'guven',
    'checkin',
    'Güven seviyesi ne için?',
    `Sayının anlatmadığını anlatır. Bir key result %70'te olabilir ama sahibi hedefe ulaşılamayacağını biliyordur — güven seviyesi bunu görünür kılar.

**Yüksek** hedefe ulaşılacak · **Orta** belirsiz · **Düşük** müdahale gerekiyor.

Yönetici Raporu'nda ilerlemeyle birlikte görünür. Yüzdesi iyi ama güveni düşük bir key result, yüzdesi kötü olandan daha acil olabilir.`,
  ),
  entry(
    'checkin-gecmisi',
    'checkin',
    'Check-in geçmişini görebilir miyim?',
    `Kayıtlar tutuluyor — her check-in önceki değeri, yeni değeri, yazarı, tarihi ve notu saklıyor.

Ancak şu an bunu gösteren bir ekran **yok**. Veri duruyor, arayüzü henüz yapılmadı. İhtiyaç duyarsanız eklenebilir.`,
  ),

  /* ------------------------------- periods ------------------------------ */
  entry(
    'mali-yil',
    'periods',
    'Çeyrekler hangi aylara denk geliyor?',
    `Mali yıl **Eylül**'de başlar ve çeyrek etiketindeki yıl, mali yılın *başladığı* yıldır.

**Q1** Eylül–Kasım · **Q2** Aralık–Şubat · **Q3** Mart–Mayıs · **Q4** Haziran–Ağustos

Yani \`2026-Q1\` = 1 Eylül – 30 Kasım 2026. Q2 yıl atlar: \`2026-Q2\` = Aralık 2026 – Şubat 2027.

Dikkat edilecek nokta: Ağustos 2026 hâlâ \`2025-Q4\`'tedir, \`2026\` etiketli hiçbir çeyrekte değildir.`,
  ),
  entry(
    'donem-degistir',
    'periods',
    'Hangi döneme baktığımı nasıl değiştirebilirim?',
    `Topbar'daki **Dönem** açılır menüsü. Seçim adres satırına yazılır (\`?period=2025-Q1\`), yani bağlantıyı kopyalayıp paylaşabilirsiniz — karşı taraf aynı dönemi görür.

Açık dönem listede **•** işaretiyle belirtilir. Ekranlar arasında gezinirken seçtiğiniz dönem korunur.`,
  ),
  entry(
    'donem-ekle',
    'periods',
    'Yeni dönem nasıl eklenir, hangisi "açık" olur?',
    `**Yönetim → Dönemler**. Kod \`2027-Q1\` biçiminde olmalı, başlangıç ve bitiş tarihini girin. Yeni dönem *Planlandı* olarak açılır.

Bir dönemi **Aktif** yapmak, diğer aktif dönemi otomatik olarak kapatır — uygulama tek bir açık döngüye göre açıldığı için aynı anda iki açık çeyrek olamaz.

Tarih yanlış girildiyse aynı tabloda **Tarihleri düzenle** ile düzeltilir. Dönem **kodu** değiştirilemez; her yerde o dönemi tanımlar.`,
  ),
  entry(
    'aylik-yok',
    'periods',
    'Sadece Temmuz ayına bakabilir miyim?',
    `Hayır, aylık kırılım bilinçli olarak yok.

İki sebep var. Birincisi, bir ay çeyreğin objective'lerini gösteremez — dönemler bağımsız kovalardır, tarihleri örtüşse de aralarında ilişki kurulmaz. İkincisi ve daha önemlisi, ilerlemenin zaman boyutu yok: bir key result'ın tek bir "güncel" değeri var. Temmuz'a bakınca 31 Temmuz'daki değeri değil bugünkü değeri görürdünüz. Boş ekran kötüdür, sessizce yanlış ekran daha kötü.

Check-in geçmişi biriktikçe "31 Temmuz'da bu KR kaçtı" sorusu yeniden kurulabilir hale gelecek; veri bunun için saklanıyor.`,
  ),

  /* -------------------------------- admin ------------------------------- */
  entry(
    'kullanici-ekle',
    'admin',
    'Yeni kullanıcı veya personel nasıl eklenir?',
    `**Yönetim → Kullanıcılar**. Ad, e-posta, rol ve bölüm girin.

Rol **Yönetici** veya **Üst Yönetim** ise parola alanı çıkar — en az 12 karakter. Parolayı siz belirler ve kişiye kendiniz iletirsiniz; sistem e-posta göndermez.

Rol **Personel** ise parola alanı çıkmaz. Bu kişi giriş yapamaz, yalnızca sorumlu olarak görünür.`,
  ),
  entry(
    'kullanici-sil',
    'admin',
    'Bir kişiyi neden silemiyorum?',
    `O kişi bir objective, key result veya check-in kaydında sorumlu görünüyorsa silinmez. Silmek performans geçmişini de götürürdü.

Bunun yerine **Pasifleştir**. Kişi listede kalır, mevcut atamaları korunur, yeni atama listelerinde çıkmaz ve giriş yapamaz.

Hiçbir kayıtta görünmeyen kişiler silinebilir.

Ayrıca kendinizi silemez veya pasifleştiremezsiniz, son yönetici hesabını da düşüremezsiniz — kimsenin kalmadığı bir sistem oluşmasın diye.`,
  ),
  entry(
    'bolum-ekle',
    'admin',
    'Bölüm nasıl eklenir, silinir, sırası değiştirilir?',
    `**Yönetim → Bölümler**. Emoji, Türkçe ad, İngilizce ad ve kısa ad girip **Ekle**.

**Kısa ad** adres satırında görünür (\`/bolum/kisa-ad\`) ve **sonradan değiştirilemez** — değişse tüm bağlantılar kırılırdı. Yalnızca küçük harf, rakam ve tire kullanın.

**↑ ↓** düğmeleri sol menüdeki sırayı değiştirir.

Bir bölüm objective barındırdığı sürece **silinemez**; silmek o bölümün tüm performans geçmişini götürürdü. Önce objective'leri kaldırın. Bölüme bağlı kişiler silinmez, yalnızca bölüm alanları boşaltılır.`,
  ),

  /* ------------------------------- account ------------------------------ */
  entry(
    'parola-degistir',
    'account',
    'Kendi parolamı nasıl değiştiririm?',
    `Sol menünün altındaki adınıza tıklayın — **Hesabım** ekranı açılır.

Mevcut parolanız oturumunuz açık olsa bile sorulur. Bu bilinçli: açık bırakılmış bir tarayıcı kalıcı bir devralmaya dönüşmesin diye.

Yeni parola en az 12 karakter olmalı ve eskisinden farklı olmalı.`,
  ),
  entry(
    'parola-unuttum',
    'account',
    'Parolamı unuttum, ne yapmalıyım?',
    `"Şifremi unuttum" bağlantısı yok — sistem e-posta göndermiyor. Sıralı çözüm:

**1.** Bir yöneticiye ulaşın. **Yönetim → Kullanıcılar**'da satırınızdaki **Parola** düğmesiyle yeni parolanızı belirler ve size iletir. Sonra **Hesabım**'dan kendiniz değiştirin.

**2.** Bütün yöneticiler parolasını unuttuysa kimse kimseyi kurtaramaz. O durumda veritabanına erişimi olan kişi \`npm run set-password\` komutunu çalıştırır.

Bu yüzden **en az iki yönetici hesabı tutun.**`,
  ),
  entry(
    'kilitlendim',
    'account',
    '"Çok fazla başarısız deneme" diyor, ne oldu?',
    `Aynı e-posta için 15 dakika içinde 5 başarısız denemeden sonra adres 15 dakika kilitlenir. Bu süre içinde **doğru parola da kabul edilmez**.

Kaba kuvvet denemelerine karşı böyle. Beklemek yeterli; süre dolunca kendiliğinden açılır.

Acele ediyorsanız veritabanına erişimi olan kişi \`npm run unlock\` ile temizleyebilir.`,
  ),
  entry(
    'dil',
    'account',
    'Arayüz dilini değiştirebilir miyim?',
    `Topbar'ın sağındaki **TR / EN** düğmesi. Seçim tarayıcınızda saklanır, diğer kullanıcıları etkilemez.

Bölüm adları ve prototipten gelen objective/key result başlıkları iki dilde girilmiştir. Sizin sonradan eklediğiniz kayıtlarda İngilizce alan Türkçesiyle aynı olur — çeviri yapan bir mekanizma yok, sonradan düzenlenebilir.`,
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
