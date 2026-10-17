# J.A.R.V.I.S. Local Interface

Türkçe kurulum ve kullanım rehberi.

## Kurulum

1. ZIP dosyasını bir klasöre çıkar.
2. Node.js 20 veya daha yeni bir sürüm yükle.
3. Bu klasörde PowerShell / Terminal açıp `node server.mjs` komutunu çalıştır.
4. Tarayıcıda `http://127.0.0.1:3030` adresini aç.
5. **API ACCESS** düğmesinden kendi OpenAI API anahtarını bağla.

Uygulama ek paket veya veritabanı istemez. API anahtarı sunucu işleminin belleğinde kalır, sunucu kapatıldığında silinir ve HTML/JavaScript kaynaklarına yazılmaz. API kullanımı ücretlendirme doğurabilir. Anahtarı sohbet mesajına veya başkasına gönderme.

## Dil ve ses

- Dil menüsünde 179 ISO dil kodu bulunur. Seçilen dil sohbet yanıtlarına uygulanır; model dillerin tümünü aynı kalitede desteklemeyebilir.
- **VOICE ON/OFF** düğmesi yanıtları tarayıcıdaki metin okuma sesiyle seslendirir. Seçilen dilde ses yoksa tarayıcı başka bir ses kullanabilir ya da ses üretmeyebilir.
- Mikrofon girişi tarayıcı desteği ve kullanıcı izni gerektirir.

## Kısayollar ve mini oyunlar

**SETUP** ekranından kısayol adı, tuş kombinasyonu, izinli eylem ve gerekiyorsa Masaüstü klasör adını seçip ekleyebilirsin. Kısayollar yalnızca Jarvis sekmesi açık ve odaktayken çalışır; diğer uygulamalarda küresel klavye kısayolu değildir. Eylemler izin listesinde sabittir; özel kısayol adı komut çalıştırmaz.

**FUN** ekranında kelime zinciri ve 1–100 sayı tahmin oyunu bulunur. Şaka düğmesi seçilen dilde kısa bir şaka üretmesi için API'ye istek gönderir.

## Chat komutları

- `YouTube'yi aç` varsayılan tarayıcıda YouTube ana sayfasını açar.
- `Ateşle!` YouTube'da Iron Man ateşleme sahnesi arar. En fazla günde iki defa çalışır; sayaç UTC gününe göre yerel sunucuda saklanır. Video otomatik oynatılmaz.
- `İki gözümün çiçeği şuraları aydınlat hele` YouTube'da ilgili meme ifadesini arar; bir sonuç seçip oynatabilirsin.
- `Masaüstündeki Oyunlar klasörünü aç` yalnızca Masaüstündeki doğrudan `Oyunlar` klasörünü açar. İsim kullanıcı tarafından verilmelidir; başka dizinlere giden yollar kabul edilmez.
- `kelime türetme`, `oyunlar` ifadeleri FUN ekranını açar.

## İşletim sistemi seçimi

Üst menüde Auto Detect, Windows, Pardus / Linux ve macOS profilleri vardır. Seçim uygulama adlarını ve profil görünümünü değiştirir. Masaüstü işlemleri sadece gerçek işletim sistemiyle eşleşince çalışır. Pardus/Linux'ta uyumlu metin düzenleyici, hesap makinesi, dosya yöneticisi ve `xdg-open` bulunmalıdır.

## Tarayıcı kaynakları ve güvenlik

Bu uygulama yerel web sayfası olarak çalışır. Bir web sayfası tarayıcı geliştirici araçlarını, F12'yi veya kullanıcının kendi bilgisayarındaki kaynak dosyaları güvenilir biçimde kilitleyemez. Paylaşılacak veya dağıtılacak gerçek masaüstü ürünü için imzalı, paketlenmiş bir uygulama ve ayrı güvenlik modeli gerekir. Bu sürüm rastgele terminal komutları çalıştırmaz.

OpenAI anahtarı istemci dosyalarından ayrı tutulur ve yalnızca sohbet isteği sırasında OpenAI Responses API'ye iletilir. Ayrıntılar için OpenAI'nin [API başlangıç rehberine](https://developers.openai.com/api/docs/quickstart?site_locale=en) bak.
