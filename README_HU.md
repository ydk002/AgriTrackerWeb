# AgriTracker Web — Műszaki Dokumentáció és Prezentációs Segédlet

Ez a dokumentum az **AgriTracker Web** egyoldalas webalkalmazás (Single-Page Application – SPA) felépítését, a felhasznált technológiákat, a főbb kódfunkciókat és a rendszerelemek közötti kapcsolatokat foglalja össze magyar nyelven, kifejezetten a projekt bemutatásához és védéséhez.

---

## 1. Projekt Áttekintés

Az **AgriTracker Web** egy felhőalapú mezőgazdasági életciklus- és pénzügyi nyomonkövető rendszer. A célja, hogy a gazdaságok (farmok) vezetői egyetlen átlátható webes felületen tudják kezelni:
- a **növényállományokat és állatcsoportokat (batcheket)** és azok elhelyezkedését (zónákat),
- a napi **mezőgazdasági műveleteket** (ültetés, etetés, gyógyszerezés, betakarítás, elhullás, értékesítés),
- a **raktárkészletet és pénzügyeket** (ömlesztett alapanyagok vásárlása, költségallokáció az egyes állományokra, eladási bevételek, valamint selejt/romlás leírása),
- a gazdaság GPS-koordinátáihoz kötött **élő időjárási adatokat és veszélyjelzéseket** (fagy-, vihar-, szél- és hőségriadó).

---

## 2. Felhasznált Technológiák (Tech Stack)

| Réteg | Technológia | Miért ezt használtuk és mi a szerepe? |
| :--- | :--- | :--- |
| **Frontend keretrendszer** | **React 19** | Komponensalapú felépítést biztosít. Deklaratív módon, állapotok (state) alapján frissíti a felhasználói felületet oldalújratöltés nélkül (SPA). |
| **Programozási nyelv** | **TypeScript** | Statikus típusellenőrzést ad a JavaScripthez. Megakadályozza a futásidejű típushibákat, és pontos interfészekkel (`Farm`, `Asset`, `VaultItem`) képezi le az adatbázis-táblákat. |
| **Build eszköz** | **Vite** | Modern, villámgyors fejlesztői szervert (HMR – Hot Module Replacement) és optimalizált produkciós csomagolást (bundling) biztosít. |
| **Útvonalválasztás (Routing)** | **React Router v7** | Kliensoldali navigációt valósít meg (`/login`, `/dashboard`, `/assets`, `/ledger`), beleértve a védett útvonalakat (`ProtectedRoute`). |
| **Stílusozás** | **CSS Modules + CSS Változók** | Minden komponens saját, elszigetelt (scoped) `.module.css` fájllal rendelkezik, így a stílusok nem ütköznek egymással. A globális színeket és árnyékokat CSS változók (`--color-primary`, stb.) tárolják. |
| **Backend & Adatbázis** | **Supabase (PostgreSQL)** | Backend-as-a-Service megoldás. Biztosítja a relációs PostgreSQL adatbázist, a JWT-alapú felhasználói hitelesítést (**Supabase Auth**), a sor-szintű jogosultságkezelést (**RLS**) és a szerveroldali **PL/pgSQL triggereket**. |
| **Külső API** | **Open-Meteo REST API** | Ingyenes meteorológiai API, amely a farm szélességi és hosszúsági fokai alapján valós idejű időjárási adatokat és 7 napos előrejelzést szolgáltat. |

---

## 3. Hogyan Kapcsolódik Össze Minden? (Rendszerarchitektúra)

A rendszer működése három fő réteg együttműködésére épül:

```text
[ Böngésző: React + TypeScript SPA ]
        │
        ├── 1. Hitelesítés & Adatbázis-műveletek (@supabase/supabase-js)
        │         ▼
        │   [ Supabase Cloud ]
        │     ├── Supabase Auth (JWT token generálás és munkamenet-kezelés)
        │     ├── Row-Level Security (RLS: mindenki csak a saját farmját látja)
        │     └── PostgreSQL + Triggerek (automatikus költségszámítás és készletlevonás)
        │
        └── 2. Időjárás lekérdezés (fetch REST hívás GPS-koordinátákkal)
                  ▼
            [ Open-Meteo API ] (élő hőmérséklet, szél, csapadék, 7 napos előrejelzés)
```

### Az adatfolyam lépésről lépésre:
1. **Indítás és Hitelesítés**: Amikor a alkalmazás betöltődik (`main.tsx` -> `App.tsx`), az `AuthProvider` (`src/context/AuthContext.tsx`) ellenőrzi a Supabase-nél, hogy van-e érvényes bejelentkezési munkamenet (JWT token).
2. **Útvonalvédelem**: Ha a felhasználó nincs bejelentkezve, a `ProtectedRoute` komponens automatikusan átirányítja a `/login` oldalra.
3. **Farm és Profil betöltése**: Sikeres belépés után a `useFarm` egyedi hook (`src/hooks/useFarm.ts`) lekéri a bejelentkezett felhasználó profilját (`profiles` tábla), majd az ahhoz tartozó gazdaság adatait (`farms` tábla) és helyszíneit (`zones` tábla).
4. **Oldalak és Adatbázis interakció**: A főoldalak (`DashboardPage`, `AssetsPage`, `LedgerPage`) a `supabase` kliensen keresztül közvetlenül kommunikálnak a PostgreSQL adatbázissal. Minden egyes lekérdezést és beszúrást a Supabase **Row-Level Security (RLS)** szabályai ellenőriznek a szerveren.

---

## 4. A Kód Fő Moduljai és Függvényei

### 4.1. Alapkonfiguráció és Típusok
- **[`src/lib/supabase.ts`](file:///c:/Users/antal/Desktop/internship/agri_tracker_web/src/lib/supabase.ts)**: Létrehozza az egyetlen közös (singleton) Supabase klienst a `.env` fájlban megadott URL és publikus kulcs alapján.
- **[`src/types/index.ts`](file:///c:/Users/antal/Desktop/internship/agri_tracker_web/src/types/index.ts)**: Tartalmazza az összes adatbázis-tábla TypeScript interfészét (`Farm`, `Profile`, `Zone`, `Asset`, `OperationalEvent`, `VaultItem`, `LedgerAllocation`, `Sale`, `SpoilageLog`), valamint az `extractEventNotes()` segédfüggvényt, amely a PostgreSQL `JSONB` formátumú esemény-részletekből biztonságosan kinyeri a szöveges megjegyzéseket.

### 4.2. Hitelesítés és Állapotkezelés (Context & Hooks)
- **[`src/context/AuthContext.tsx`](file:///c:/Users/antal/Desktop/internship/agri_tracker_web/src/context/AuthContext.tsx)** és **[`src/hooks/useAuth.ts`](file:///c:/Users/antal/Desktop/internship/agri_tracker_web/src/hooks/useAuth.ts)**:
  - `supabase.auth.onAuthStateChange()`: Figyeli a ki- és bejelentkezéseket valós időben.
  - `signIn(email, password)` és `signUp(email, password)`: Kezeli a belépést és az új regisztrációt. *(Új regisztrációkor egy adatbázis-trigger a szerveren automatikusan létrehoz egy új farmot és egy `farm_manager` profilt a felhasználónak).*
  - `signOut()`: Kijelentkezteti a felhasználót.
- **[`src/hooks/useFarm.ts`](file:///c:/Users/antal/Desktop/internship/agri_tracker_web/src/hooks/useFarm.ts)**:
  - `loadFarmData()`: Lekéri a felhasználóhoz tartozó `profiles`, `farms` és `zones` rekordokat (`Promise.all` segítségével párhuzamosítva).
  - `updateCoordinates(latitude, longitude)`: Elmenti a böngésző GPS-éből kapott koordinátákat a `farms` táblába.
  - `createZone(name, description)`: Új mezőgazdasági zónát (pl. üvegház, istálló, parcella) szúr be a `zones` táblába.

### 4.3. Időjárás Szolgáltatás
- **[`src/services/weatherService.ts`](file:///c:/Users/antal/Desktop/internship/agri_tracker_web/src/services/weatherService.ts)**:
  - `fetchFarmWeather(latitude, longitude)`: Lekéri az Open-Meteo API-tól az aktuális időjárást és a 7 napos előrejelzést, majd kiértékeli a mezőgazdasági riasztási szabályokat:
    - **Viharriadó** (`weatherCode` 95, 96, 99),
    - **Fagyveszély** (`<= -5 °C` kritikus fagy, `<= 2 °C` talajmenti fagykockázat),
    - **Extrém hőség** (`>= 35 °C`),
    - **Erős szél** (`>= 50 km/h`).

### 4.4. Felhasználói Felület és Oldalak (Pages)
- **[`src/components/Layout.tsx`](file:///c:/Users/antal/Desktop/internship/agri_tracker_web/src/components/Layout.tsx)**: Az alkalmazás kerete. Asztali gépen fix oldalsávot (sidebar), mobilon pedig becsúszó (hamburger) menüt jelenít meg, a jobb oldalon pedig a React Router `<Outlet />` komponensén keresztül tölti be az aktuális oldalt.
- **[`src/pages/DashboardPage.tsx`](file:///c:/Users/antal/Desktop/internship/agri_tracker_web/src/pages/DashboardPage.tsx)** (Irányítópult):
  - Összesítő KPI kártyákat jelenít meg (Összes állomány, Aktív állományok, Zónák száma, Aktuális hőmérséklet).
  - `handleDetectLocation()`: A böngésző beépített `navigator.geolocation` API-jával lekéri a pontos GPS-pozíciót, frissíti a farmot a Supabase-ben, és újratölti az időjárást.
  - Megjeleníti a legutóbbi 5 mezőgazdasági eseményt (`operational_events`).
- **[`src/pages/AssetsPage.tsx`](file:///c:/Users/antal/Desktop/internship/agri_tracker_web/src/pages/AssetsPage.tsx)** (Állományok / Batchek kezelése):
  - `enrichedAssets` (`useMemo`): **Event-Sourcing (eseményalapú) készletszámítás**. Az adatbázisban nem egy módosítható `current_quantity` számot tárolunk, hanem az induló mennyiségből (`initial_quantity`) dinamikusan vonjuk le a csökkentő típusú események (`attrition`, `harvest`, `split`, `sale`) mennyiségét.
  - `handleCreateAsset()`: Létrehoz egy új növény- vagy állatállományt az `assets` táblában, és azonnal rögzít hozzá egy kezdeti `planting` eseményt az `operational_events` táblában.
  - `handleLogEvent()`: Új eseményt (etetés, gyógyszerezés, betakarítás, veszteség) fűz hozzá az eseménynaplóhoz.
  - `getBatchFinancials()`: Kiszámítja az adott állományra allokált költségeket, az eladási árbevételt és a nettó nyereséget (Unit Economics).
- **[`src/pages/LedgerPage.tsx`](file:///c:/Users/antal/Desktop/internship/agri_tracker_web/src/pages/LedgerPage.tsx)** (Pénzügyi Főkönyv):
  - 5 valós idejű pénzügyi mutatót számol ki: Összes beszerzés, Raktáron lévő készletérték, Eladási árbevétel, Selejt/romlás veszteség és Nettó farm-fedezet (Margin).
  - `handlePurchase()`: Új tételt vesz fel a raktárba (`ledger_vault`), ahol a PostgreSQL generált oszlopa (`GENERATED ALWAYS AS`) automatikusan kiszámítja az egységárat (`unit_cost`).
  - `handleAllocate()`: Alapanyagot rendel hozzá egy konkrét állományhoz (`ledger_allocations`).
  - `handleSale()`: Eladást rögzít a `sales` táblában, és egyúttal beszúr egy `sale` eseményt az `operational_events` táblába, hogy az állomány darabszáma/tömege is csökkenjen.
  - `handleSpoilage()`: Megromlott vagy kiszóródott alapanyagot ír le veszteségként (`spoilage_logs`).

---

## 5. Három Érdekesség, Amit Érdemes Kiemelni a Tanárnak

1. **Eseményalapú (Event-Sourced) Készletnyilvántartás**:
   - Ahelyett, hogy egyetlen számot írnánk felül az adatbázisban (ami könnyen elcsúszhat vagy elveszítheti a történetiségét), minden mezőgazdasági munka egy megváltoztathatatlan (append-only) eseményként kerül az `operational_events` táblába. Az aktuális készlet mindig a múltbeli események összegeként áll elő.
2. **Szerveroldali Pénzügyi Triggerek (PostgreSQL)**:
   - Amikor a webalkalmazásban alapanyagot osztunk ki egy állományra (`ledger_allocations`) vagy selejtet írunk le (`spoilage_logs`), egy PostgreSQL `BEFORE INSERT` trigger (`process_ledger_vault_deduction`) zárolja a raktártételt, ellenőrzi, hogy van-e elég készlet, 4 tizedesjegy pontossággal kiszámítja a költséget, és levonja a felhasznált mennyiséget a raktárból. Így nem fordulhat elő kerekítési hiba vagy negatív raktárkészlet.
3. **Több-bérlős (Multi-Tenant) Biztonság RLS-sel**:
   - Az adatbázis minden tábláján **Row-Level Security (RLS)** van bekapcsolva. A `public.current_farm_id()` SQL függvény a bejelentkezett felhasználó JWT tokenje alapján azonosítja a farmot, így még ha valaki módosítaná is a frontend kódot a böngészőben, az adatbázis-szerver akkor sem engedné, hogy más gazdaságok adatait lássa vagy módosítsa.
