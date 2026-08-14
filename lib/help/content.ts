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

Yapı üç katmanlı: **bölüm** → **objective** → **key result**. Bir bölümün ilerlemesi, objective'lerinin ortalaması; bir objective'in ilerlemesi de key result'larının ortalamasıdır. Hepsi ağırlıksız — ölçülebilir her key result eşit sayar. "Ölçülemiyor" rozeti taşıyan bir key result hiç sayılmaz, sıfır olarak da değil — bkz. "'Ölçülemiyor' rozeti ne anlama geliyor?".

Aynı kural bir üst katmanda da geçerli: hiçbir key result'u ölçülemeyen bir objective, objective ortalamasına katılmaz. Şirket ilerlemesi de objective'i olan bölümlerin ortalamasıdır. Objective'i olmayan — ya da hiçbir key result'u ölçülemeyen — bölüm ortalamaya katılmaz, %0 olarak sayılmaz.`,
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

Sonuç %0 ile %140 arasına sıkıştırılır. %0 altı, hedeften uzaklaşmayı negatif çubuk yerine "başlamadı" olarak gösterir; %140 üstü de aşırı aşılmış bir key result'ın üstteki ortalamaları ele geçirmesini engeller.

Başlangıç ve hedef **aynı** değerse bu formülün paydası sıfır olur — o key result "Ölçülemiyor" işaretlenir, bkz. bir sonraki soru.`,
  ),
  entry(
    'olculemiyor',
    'basics',
    '"Ölçülemiyor" rozeti ne anlama geliyor?',
    `Bir key result'ın **başlangıcı ve hedefi aynıysa** kapanacak bir mesafe yoktur — ilerleme yüzdesi tanımsızdır, sıfır değil. Bu satırlar tabloda ilerleme çubuğu yerine "Ölçülemiyor" rozetiyle gösterilir.

Bu rozeti gördüğünüzde satır **hiçbir ortalamaya girmez**: objective, bölüm ve şirket ortalamalarının hepsi bu key result'ı atlar — sıfır olarak da saymaz, çünkü sıfır "hiç ilerleme yok" demek olurdu, oysa asıl durum "henüz hedef girilmemiş". Aynı sebeple bu satırlar Performans Özeti'ndeki "Dikkat" listesinde ve Yönetici Raporu'ndaki "Gelişime Açık" listesinde de görünmez — ölçülemeyen bir satıyı en acil müdahale gereken satırmış gibi göstermek yanıltıcı olurdu.

Düzeltmek için **Düzenle** ile gerçek başlangıç ve hedef değerlerini girin; ikisi birbirinden farklı olduğu anda rozet kalkar ve key result normal şekilde ölçülmeye başlar.`,
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

Objective her zaman **o an açık olan döneme** yazılır. Topbar'daki tarih aralığı filtresi hangi verilerin görüntülendiğini değiştirir, yeni objective'in hangi döneme gideceğini değiştirmez — geçmiş bir aralık seçili olsa bile sihirbaz açık dönemi kullanır.`,
  ),
  entry(
    'gecmis-veri',
    'okr',
    'Geçmiş bir döneme yeni objective açabilir miyim?',
    `Hayır. Yeni objective'ler her zaman **o an açık olan döneme** yazılır; topbar'da geçmişe dönük bir tarih aralığı seçili olması bunu değiştirmez. Kapalı bir dönemi geriye dönük doldurma sihirbazı artık yok — bu bilinçli bir ürün kararı.

Kapalı bir döneme ait, zaten var olan bir objective'in key result'larını görüntüleyebilirsiniz, ama **Güncel** değerini artık buradan düzeltemezsiniz: objective sayfasındaki **Düzenle**, key result'ın başlangıcını, hedefini, birimini, toplama kuralını ve sorumlusunu değiştirir — **Güncel** salt okunurdur, çünkü artık aylık kayıtlardan türetilen bir özettir, elle yazılan bir alan değil (bkz. "Aylık veri girişi nedir, nerede kullanılır?"). Gerçek figürü düzeltmenin yolu **Aylık Veri Girişi** ekranıdır, ama o ekran da yalnızca **açık** dönemin aylarını listeler — kapalı bir döneme ait bir key result oraya gidip bulunamaz. Sonuç olarak kapalı bir dönemin ölçülen değeri şu an arayüzden düzeltilemez; bkz. "Key result değerini değiştirmek için check-in mi, aylık giriş mi, düzenleme mi?".`,
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
    'Key result değerini değiştirmek için check-in mi, aylık giriş mi, düzenleme mi?',
    `Üçünün de amacı farklı:

**Check-in** haftalık ölçümdür. Denetim izi bırakır: kim, ne zaman, hangi değerden hangi değere, hangi notla. İçinde bulunduğunuz ayın kaydını yazar. Rutin, "bu hafta ne oldu" güncellemeleri için bunu kullanın.

**Aylık Veri Girişi** ekranı açık dönemin herhangi bir ayının kaydını yazar veya düzeltir — bkz. "Aylık veri girişi nedir, nerede kullanılır?". Check-in'den farkı: denetim izi bırakmaz, hangi ayı düzelttiğinizi siz seçersiniz. Geçmiş bir ayı unutmuşsanız veya yanlış girmişseniz buradan düzeltin.

**Düzenle** artık **Güncel**'i hiç değiştirmez — objective sayfasındaki bu form başlangıcı, hedefi, birimi, toplama kuralını ve sorumluyu düzeltmek içindir. Yanlış girilmiş bir hedefi veya yazım hatasını düzeltmek için kullanın, gerçek ölçüm değerini değil.

Kısaca: bu hafta gerçekten bir şey ölçüldüyse check-in, geçmiş bir ayın kaydı eksik veya yanlışsa Aylık Veri Girişi, hedef/başlangıç/kural gibi bir tanım hatası varsa Düzenle.`,
  ),
  entry(
    'toplama-kurali',
    'okr',
    "Bir key result'ın toplama kuralı (Toplam / Ortalama / Son değer) ne anlama geliyor?",
    `Bir key result'ın ay ay girilen değerlerinin tek bir dönem figürüne nasıl indirgeneceğini belirler. Üç seçenek var:

**Toplam** — aylar toplanır. Hasta sayısı, lead sayısı, ciro gibi biriken metrikler için.

**Ortalama** — aylar ortalanır, ama yalnızca **dolu** aylar üzerinden — on iki aylık bir dönemde üç ay veri varsa ortalama üçe bölünür, on ikiye değil. Skor, anket ve oran gibi metrikler için.

**Son değer** — en son girilen ayın değeri geçerli olur. Yıllık ölçümler ve aşamalı işler için (bir projenin hangi fazda olduğu gibi).

Kural her key result için ayrı ayrı, objective sayfasındaki **Düzenle**'de **Kural** açılır menüsünden değiştirilir. Kuralı değiştirmek key result'ın mevcut aylık kayıtlarını silmez — sadece o kayıtları yeni kuralla yeniden topladığı için **Güncel** değeri anında değişebilir. Boş bırakılan bir ayın bu toplamı nasıl etkilediği kurala göre değişir — bkz. "Bir ayı boş bırakırsam key result'ın rakamı ne olur?".`,
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
    'Mali yıl hangi aylara denk geliyor?',
    `Mali yıl **Eylül**'de başlar ve koddaki yıl, mali yılın *başladığı* yıldır: \`2026-FY\` = 1 Eylül 2026 – 31 Ağustos 2027. Şirketin objective'leri bu döngüye bağlıdır — dönem seçicideki **Mali yıl başından bugüne** ve **Geçen mali yıl** seçenekleri de aynı sınırı kullanır.

Dikkat edilecek nokta: Ağustos 2026 hâlâ \`2025-FY\`'nin içindedir, \`2026\` etiketli hiçbir dönemde değildir.

Sistem çeyrek ve ay uzunluğunda dönemleri de tanır — kodları sırasıyla \`2026-Q3\` ve \`2026-08\` biçimindedir — ama **Yönetim → Dönemler** ekranındaki formdan yalnızca mali yıl oluşturulabilir; bu ölçekte bir bölünmeye ihtiyaç duyulursa geliştirici tarafından elle eklenir.`,
  ),
  entry(
    'donem-degistir',
    'periods',
    'Hangi tarih aralığına baktığımı nasıl değiştirebilirim?',
    `Topbar'daki **tarih aralığı** seçicisi. Hazır seçenekler var — **Mali yıl başından bugüne**, **Bu dönem**, **Geçen mali yıl** — ya da **Özel aralık…** ile başlangıç ve bitiş tarihini kendiniz girebilirsiniz.

Seçim adres satırına yazılır (\`?from=2025-09-01&to=2026-08-31\`), yani bağlantıyı kopyalayıp paylaşabilirsiniz — karşı taraf aynı aralığı görür. Eski \`?period=2025-Q1\` biçimindeki bağlantılar da hâlâ çalışır, o dönemin tarihlerine karşılık gelir.

Seçtiğiniz aralık bir veya birden fazla dönemi kapsayabilir; ekranlar o aralığa denk gelen tüm dönemlerin verisini birleştirip gösterir. Ekranlar arasında gezinirken seçtiğiniz aralık korunur.`,
  ),
  entry(
    'kesit-anlami',
    'periods',
    'Tarih aralığındaki "başlangıç" ve "bitiş" tam olarak ne anlama geliyor?',
    `Aralığın **bitişi** bir kesit tarihidir: bu aralığı kullanan ekranların (Performans Özeti, Yönetici Raporu, Bölüm ve Objective ekranları, sol menüdeki bölüm yüzdeleri) ana rakamı, o tarihe kadar ölçülmüş durumu gösterir — dönemin kendi başlangıcından itibaren birikmiş olarak. Bitişi geçmişe çekmek geçmişteki bir kesite bakmak demektir, bugüne çekmek en güncel duruma bakmak demektir. Bitiş **bugünden ileri** bir tarihe ayarlanırsa (örneğin "Bu dönem" seçeneği, dönem sonu henüz gelmemişken) kesit bugüne çekilir; henüz yaşanmamış bir ay için "o tarihe kadarki durum" diye bir şey yoktur. **Aylık Veri Girişi** ve **Yönetim** ekranları bu kesite bakmaz; onlar her zaman açık dönemin kendi haline bakar.

Her ekrandan açabildiğiniz **check-in** penceresi de bu kesite bakmaz: orada bir key result'ın kayıtlı özet değeri görünür, yani girilmiş tüm ayları kapsayan güncel rakam. Geçmişe çekilmiş bir kesitte, arkadaki satır ile check-in penceresi farklı bir "güncel" değer gösterebilir; bu beklenen bir durumdur, çünkü check-in her zaman bugünün rakamı üzerine yazılır.

Aralığın **başlangıcı** farklı bir işe yarar: hangi dönemlerin bu aralığa dahil olacağını belirler, aralığı kesen her dönem listeye girer. Bir dönemin **içinde** başlangıcı ileri veya geri kaydırmak hiçbir rakamı değiştirmez — figürler her zaman kendi döneminin ilk ayından hesaplanır, aralığın başlangıcından değil. Başlangıç yalnızca bir dönemi aralığın tamamen dışına itecek kadar kaydığında fark yaratır; o zaman o dönem tüm ana rakamlardan düşer — ve Performans Özeti'nin **Hero** yerleşiminde en üstteki karttaki dönem etiketinden (örn. "2026-FY") de düşer; bu etiket yalnızca o yerleşimde görünür, Kokpit ve Odak yerleşimlerinde hiç çizilmez. Tarih aralığı seçicisinin kendisi bundan etkilenmez — o her zaman aynı hazır seçenekleri listeler, hangi dönemlerin aralığa girdiğine bakmaz.`,
  ),
  entry(
    'donem-ekle',
    'periods',
    'Yeni dönem nasıl eklenir, hangisi "açık" olur?',
    `**Yönetim → Dönemler**. Kod \`2027-FY\` biçiminde olmalı (mali yıl), başlangıç ve bitiş tarihini girin. Yeni dönem *Planlandı* olarak açılır.

Bir dönemi **Aktif** yapmak, diğer aktif dönemi otomatik olarak kapatır — türü ne olursa olsun, uygulama tek bir açık döngüye göre açıldığı için aynı anda iki açık dönem olamaz.

Tarih yanlış girildiyse aynı tabloda **Tarihleri düzenle** ile düzeltilir. Dönem **kodu** değiştirilemez; her yerde o dönemi tanımlar.`,
  ),
  entry(
    'aylik-yok',
    'periods',
    'Sadece Temmuz ayına bakabilir miyim?',
    `Hayır, ama "hayır" artık farklı bir sebepten: Bölüm, Rapor ve Performans Özeti ekranlarının ana rakamları, tarih aralığının **bitişini** bir kesit tarihi olarak okur — figür, dönemin kendi başlangıcından o bitiş tarihine kadar birikmiş durumu gösterir, Temmuz'un kendi başına değerini değil. Aralığı Temmuz sonuna daraltmak bu kesiti değiştirir, ama gösterilen rakam hâlâ dönemin başından Temmuz'a kadarki toplam/ortalama/son değerdir — Temmuz'u tek başına yalıtan bir görünüm yok; bkz. "Tarih aralığındaki 'başlangıç' ve 'bitiş' tam olarak ne anlama geliyor?". Dönemler de bağımsız kovalardır: bir ay, ait olduğu dönemin dışındaki hiçbir objective'i gösteremez.

Ama artık gerçek bir aylık kırılım var — bir key result'ın tek bir "güncel" değeri değil, ay ay girilmiş kayıtları da tutuluyor. Bunu iki yerde görürsünüz: **Aylık Veri Girişi** ekranı tek bir ayın kendi kaydını gösterir (bkz. bir sonraki soru); Performans Özeti'ndeki şirket eğilim grafiği ay ay nokta çizer, ama her nokta o aya kadarki *birikimli* rakamdır, o ayın tek başına değeri değil.`,
  ),
  entry(
    'aylik-giris',
    'periods',
    'Aylık veri girişi nedir, nerede kullanılır?',
    `Sol menüdeki **Veri Girişi** — yalnızca check-in yetkisi olanlara görünür (bugünkü rol düzeninde bu sadece **Yönetici**); Üst Yönetim salt okur olduğu için bu bağlantıyı görmez.

Ekran tek seferde bir ayı gösterir, ay seçiciden değiştirebilirsiniz — ama sadece **açık** dönemin ayları arasından. Kapalı veya planlanmış bir dönemin ayları burada hiç listelenmez ve buradan doldurulamaz.

Her key result kendi satırında, hedefiyle ve toplama kuralıyla birlikte listelenir — bkz. "Bir key result'ın toplama kuralı (Toplam / Ortalama / Son değer) ne anlama geliyor?". Boş bırakılan bir değer alanı **"girilmedi"** demektir, sıfır değil; gerçekten sıfır ölçtüyseniz \`0\` yazmanız gerekir. **Kaydet** yalnızca o oturumda değiştirdiğiniz satırları tek seferde yazar; dokunmadığınız satırlar olduğu gibi kalır.`,
  ),
  entry(
    'ay-bos',
    'periods',
    "Bir ayı boş bırakırsam key result'ın rakamı ne olur?",
    `Kurala göre değişir:

**Son değer** kuralındaki bir key result, en son ölçüldüğü ayın değerini kesite kadarki boş aylar boyunca taşır — dönem içinde daha yeni bir ay boşsa rakam değişmez, en son dolu ayın değeri geçerliliğini sürdürür. Bu, kesitten aylar önce ölçülmüş bir rakamın hâlâ gösterilebileceği anlamına gelir.

Ekran bunu gizlemez: hangi ayda ölçüldüğü, figürün yanında **"son veri: Eyl 2025"** gibi bir işaretle gösterilir. Bu sadece **Son değer** kuralına özel değil — en son dolu ayı kesitten önce kalan her key result'ta aynı şekilde çalışır, **Toplam** ve **Ortalama** dahil. İşaret Bölüm ve Objective ekranlarındaki tablo satırında ve Performans Özeti'nin "Dikkat" listesinde görünür; Yönetici Raporu bu işareti göstermez, rakamı aynı kurallarla hesaplasa da.

**Toplam** ve **Ortalama** kurallarında taşıma yoktur — boş ay basitçe hesaba katılmaz: toplama eklenmez, ortalamanın paydasına girmez.

Ayrım burada iki farklı duruma göre yapılır. Bir key result'ın **hiç** aylık kaydı yoksa (aylık veri girişi hiç kullanılmamışsa) key result'ın özet **Güncel** değeri gösterilir ve ortalamalara normal şekilde girer. Ama aylık kayıtları varsa ve kesite kadar hiçbiri dolu değilse, key result kendi **başlangıç** değerinde görünür, sıfır değil — ve bu sefer ortalamalardan **dışlanır**; bkz. "Kesite göre ölçülmemiş bir key result ortalamalara nasıl giriyor?".

Bunun aylık veri girişi ekranının kendisiyle bir ilgisi yok — o ekran her zaman o ayın kendi ham kaydını gösterir, boşsa boş kalır. Yukarıdaki kurallar, bir key result'ın figürü bir tarih aralığına göre hesaplanırken devreye girer: Bölüm, Rapor, Performans Özeti'nin ana rakamlarında ve şirket eğilim grafiğinde.`,
  ),
  entry(
    'olculmemis-kr-ortalama',
    'periods',
    'Kesite göre ölçülmemiş bir key result ortalamalara nasıl giriyor?',
    `Girmiyor — hariç tutulur. Bir key result'ın aylık kayıtları var ama kesite kadar hiçbiri dolu değilse (bkz. "Bir ayı boş bırakırsam key result'ın rakamı ne olur?"), o key result objective, bölüm ve şirket ortalamalarının hiçbirine katılmaz. Sıfır olarak da sayılmaz: sıfır "ölçüldü ve ilerleme yok" demek olurdu, oysa asıl durum "bu kesitte henüz ölçülmedi".

Performans Özeti'ndeki **ölçülen KR** sayacı bu ayrımı gösterir: kesite kadar gerçekten ölçülmüş olan key result sayısı ile toplam key result sayısını yan yana verir (örn. \`42/63 ölçülen KR\`). İkisi eşitse sayaç hiç görünmez — o zaman hariç tutulan bir key result yoktur. Hiçbir aylık kaydı olmayıp özet **Güncel** değerini koruyan key result'lar (bkz. "Bir ayı boş bırakırsam key result'ın rakamı ne olur?") bu sayaçta ölçülmüş sayılır — hariç tutulan yalnızca kaydı olup kesite kadar boş kalanlardır.`,
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
