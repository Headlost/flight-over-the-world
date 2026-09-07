# Utrzymanie strony (dla właściciela)

## Publikacja

Adres docelowy: https://headlost.github.io/flight-over-the-world/ — GitHub Pages z workflow Deploy. Gra jest dostarczana jako strona online. Lokalne komendy służą wyłącznie pracom programistycznym; nie są instrukcją instalacji dla graczy.

Teren 3D używa istniejącego tokenu właściciela z GitHub Actions secret `VITE_CESIUM_ION_KEY`. Token jest używany do budowania klienta i trafia do jego kodu. GitHub secret chroni repozytorium źródłowe, ale nie ukrywa tokenu przeglądarkowego przed odwiedzającym. Należy ograniczyć token do odczytu właściwego assetu i domeny wdrożenia oraz kontrolować limity u dostawcy. Nie używać sekretów administracyjnych w VITE_*.

Gracze nie podają żadnych kluczy. Usunięto przechowywanie kluczy graczy w sessionStorage i cały formularz połączenia z mapami. Dane ze starego formularza są usuwane przy uruchomieniu.

Mapa wyboru pinezki: Leaflet 1.9 + standardowe kafelki OpenStreetMap. Wyszukiwanie: publiczny Photon, bez klucza, tylko po zatwierdzeniu zapytania, z kolejką i podręczną pamięcią wyników. Domyślne usługi publiczne nie zapewniają SLA; przy większym ruchu należy uruchomić własny Photon lub uzgodnić warunki z dostawcą. Opcjonalne `VITE_GEOCODING_URL` wskazuje endpoint zgodny z odpowiedzią GeoJSON Photon. Limit w karcie nie jest globalnym limitem wszystkich graczy.

Źródła: [Leaflet](https://leafletjs.com/reference), [Photon](https://github.com/komoot/photon), [zasady kafelków OSM](https://operations.osmfoundation.org/policies/tiles/), [Map Tiles Google](https://developers.google.com/maps/documentation/tile/policies).

## Praca nad kodem

Node.js 22+. Dla lokalnego testu deweloperskiego istniejący token właściciela jest zapisany w ignorowanym `.env.local`.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

`npm run dev` uruchamia serwer deweloperski. `npm run preview` sprawdza zbudowany `dist`. Publiczna wersja jest wdrażana z repozytorium, nie z tego serwera.

Testy przeglądarkowe używają osobnej, fałszywej konfiguracji terenu, aby nie zużywać prywatnych limitów. Kafelki i wyszukiwanie są zastępowane kontrolowanymi odpowiedziami. Sprawdzane są rzeczywiste zdarzenia Leaflet: kliknięcie mapy, przeciąganie pinezki, wpisanie współrzędnych oraz wybór wyniku wyszukiwania. Test bufora 4K nie jest benchmarkiem fotogrametrii.
