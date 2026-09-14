# Przydzielanie sesji terenu przez n8n

Najnowsza decyzja użytkownika z 14.09.2026: osobny workflow na https://box.zakai.eu, bez instalowania usługi na serwerze i bez SSH. Panel n8n 2.34.6 jest zalogowany. Utworzono szkic „Flight Over the World — Terrain Session Pool” (workflow e2YB1YicM69MxPws).

Cesium zatwierdziło wspólną pulę kont według potwierdzenia użytkownika. Kolejność: KrukWer → GoraM → PawelekMega → główny. Limity należą do kont, nie do samych tokenów. Nie przełączamy kont w reakcji na krótkotrwałe ograniczenia 429 ani zwykłe odmowy uprawnień.

Workflow ma obsługiwać tylko początek i odnowienie sesji. Pobiera prywatnie endpoint ion oraz Google root i zwraca gotowy root z kluczem Google i identyfikatorem sesji. Przeglądarka wykorzystuje ten root bez ponownego pobierania. Dalsze kafelki płyną bezpośrednio od Google, przy zachowaniu ustawień ostrości i kamer.

Tokeny ion można w tym wariancie przechowywać poza klientem. Klucz Google i identyfikator sesji nadal muszą być dostępne w przeglądarce. Obecna opublikowana gra nadal korzysta z wcześniejszej konfiguracji bez workflow; nie deklarować ukrycia wcześniej opublikowanych tokenów.

## Wspólny licznik

Przed każdym rzeczywistym wywołaniem otwierającym sesję trzeba trwale zarezerwować jeden przydział z potwierdzonego budżetu konta. Rezerwacja i jednorazowa zgoda na wysłanie muszą być odporne na równoczesnych graczy, restart i ponowienie tego samego requestId. Niepewnych, nieudanych lub przerwanych wywołań nie zwracamy do budżetu. Nie wyznaczamy miesiąca z lokalnego kalendarza: potrzebny jest potwierdzony okres rozliczeniowy dostawcy.

Brakuje potwierdzonych miesięcznych limitów, bieżącego użycia i dat resetu dla wszystkich kont. Bez nich nie należy włączać integracji w grze. Licznik aplikacji nie widzi żądań wykonywanych poza nią; inne zastosowania kont muszą być uwzględnione albo korzystać z odrębnego budżetu z marginesem.

Atomowe warunkowe aktualizacje Data Tables potwierdzono w kodzie n8n 2.34.6 oraz na tej instancji. Dla 20 równoczesnych klientów przydzielono 8 nowych rezerwacji; razem z dwiema wcześniejszymi próbami zużyto dokładnie fikcyjny limit 10. Pozostałe 12 żądań odrzucono, duplikat otrzymał 409, liczba rzeczywistych rootów Google wyniosła 0. Alternatywny backend SQLite w server/ jest wyłącznie lokalną implementacją porównawczą, nie jest wdrażany.

Workflow produkcyjny e2YB1YicM69MxPws zawiera cztery odrębne prywatne poświadczenia Query Auth ograniczone do api.cesium.com. Workflow próby Ro1MXJrDf69agKsq został wycofany z publikacji. Wiersz 1 tabeli QjCarziIRskHBQAW ma fixtureMode:false, właściwą kolejkę oraz niepotwierdzone wartości null zamiast fikcyjnych budżetów. Produkcja pozostaje nieopublikowana.

## Walidacja przed uruchomieniem

Zachowanie licznika przy równoległych wykonaniach potwierdzono na fikcyjnych danych. Lokalne testy sprawdzają także granice okresu i budżetu. Workflow nie ponawia root po 403, 404 lub 429. Tylko jednoznaczne wygaśnięcie sesji odnawia ją przez ten sam punkt przydziału. Duplikat requestId nie daje prawa do ponownego wysłania root. Produkcyjny szablon wyłącza zapisy danych wykonania, błędów i postępu.

Sprawdzić CORS strony gry, brak JWT ion w nowym buildzie i odpowiedzi, czas do pierwszego ostrego widoku oraz ciągłość lotu podczas odnowienia. Parametr VITE_TERRAIN_POOL_ENDPOINT pozostaje pusty do ukończenia tych sprawdzeń i konfiguracji budżetów.

Referencje: [n8n Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/), [n8n Data Tables](https://docs.n8n.io/data/data-tables/), [Cesium tokeny](https://cesium.com/learn/ion/cesium-ion-access-tokens/), [Cesium optymalizacja limitów](https://cesium.com/learn/ion/optimizing-quotas/).
