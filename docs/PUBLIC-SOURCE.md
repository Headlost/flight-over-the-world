# Publiczna dystrybucja źródeł

Pełny projekt deweloperski pozostaje lokalnie. Publiczny eksport pomija sześć modułów wymienionych w scripts/public-source-manifest.json i zastępuje je komentarzami o pominięciu implementacji. Pozostałe śledzone pliki są kopiowane z aktualnej wersji roboczej. Oznaczenia nie zmieniają praw do wcześniejszego kodu projektu, zależności ani wkładu osób trzecich.

Przygotowanie: node scripts/export-public-source.mjs. Wynik jest nowym katalogiem .public-export z README i OMITTED-MODULES.md. Eksport nie zawiera pliku .env.local, historii Git, starych workflow budujących prywatne moduły, odpowiednich testów ani skompilowanej gry. Wykrycie ciągu wyglądającego jak JWT w pliku tekstowym zatrzymuje eksport. Eksport nie jest samodzielnym projektem możliwym do przebudowania bez prywatnej części.

Nie należy wypychać pełnego lokalnego drzewa do obecnego publicznego origin. GitHub stosuje widoczność do całego repozytorium, a usunięcie modułu z ostatniej wersji nie usuwa go z historii. Obecne repozytorium jest publicznym forkiem; nie można bezpośrednio zmienić widoczności pojedynczego forka. Do skutecznego rozdzielenia przyszłych źródeł potrzebny jest nowy publiczny snapshot bez prywatnych modułów i osobne miejsce dla pełnego projektu. Ukrycie wcześniej opublikowanych wersji wymaga osobnego rozwiązania historii/forka; ten skrypt tego nie robi.

Gotowa gra wymaga odrębnego procesu publikacji. Kod JavaScript uruchamiany w przeglądarce jest dostępny użytkownikom nawet po minifikacji i bez map źródłowych. Obecny build Vite wstawia tokeny z VITE_CESIUM_ION_KEY do klienta; nie wolno traktować go jako publikacji z ukrytymi tokenami. Trzeba najpierw przenieść autoryzację na serwer i zweryfikować brak sekretów w buildzie oraz odpowiedziach sieciowych. Przeniesienie do GitHub Secrets nie ukrywa wartości używanych przez frontend.

Referencje: [widoczność repozytoriów](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility), [widoczność forków](https://docs.github.com/en/pull-requests/reference/forks), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Docelowa publikacja: gałąź codex/public-source zawiera świeży eksport z pominięciami i jest domyślnym widokiem GitHuba. Gałąź codex/site zawiera wyłącznie gotowe pliki dist i jest źródłem GitHub Pages (bez ponownego budowania prywatnych modułów). Poprzedni workflow Deploy trzeba wyłączyć, aby nie nadpisywał strony starą wersją z main. Pełnego lokalnego main nie wypychać; jego commity z nową implementacją pozostają lokalne. Stara zdalna gałąź main i jej historia nie są usuwane, więc wcześniejsze źródła nadal są publiczne.

Zgodnie z priorytetem użytkownika nie kierujemy strumienia kafelków przez n8n bez pomiaru wydajności. Bieżąca publikacja zachowuje bezpośredni dostęp do terenu, a tokeny autoryzacji są dostępne w kliencie. Jest to zaakceptowany kompromis dla płynności; nie nazywać tokenów ukrytymi ani zahaszowanymi. Tajne dane wymagają integracji serwerowej i osobnego wdrożenia. Dokumentacja n8n: N8N-TERRAIN.md.

Stan wdrożenia należy potwierdzić po publikacji sprawdzeniem źródła Pages, aktywnego builda i zawartości obu gałęzi.
