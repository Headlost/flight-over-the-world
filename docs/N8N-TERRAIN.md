# Prywatny dostęp do terenu z n8n

Stan na 14.09.2026: adres istniejącej instancji `https://box.zakai.eu` odnaleziono w konfiguracji projektu BotaniQ. Odczytowe sprawdzenie `/healthz` i `/healthz/readiness` zwróciło HTTP 200 oraz `status: ok`. Publiczne `/rest/settings` udostępnia wyłącznie ograniczone ustawienia; nie potwierdzono wersji, Cloud/self-hosted ani autoryzowanego dostępu do API. Dokumentacja innych projektów wspomina Caddy, co wskazuje na możliwy self-hosting, ale nie dowodzi konfiguracji działającej instancji.

Sprawdzono dokumentację dostawcy. Nie utworzono workflow i nie wdrożono proxy. Dotychczasowy klient nadal używa tokenów z `VITE_*`; ten dokument nie zmienia sposobu ich publikacji. Priorytetem jest zachowanie płynności i jakości gry.

## Co potwierdza dokumentacja n8n

- **Webhook** udostępnia osobne adresy testowe i produkcyjne; produkcyjny działa po publikacji workflow. Obsługuje uwierzytelnianie, CORS oraz odpowiedzi binarne. Limit 16 MB dotyczy przychodzącego payloadu webhooka, nie potwierdza limitu plików zwracanych grze. [Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook)
- **HTTP Request** może pobrać odpowiedź jako `File`, a **Respond to Webhook** zwrócić `Binary File` lub JSON z ustawionym statusem i nagłówkami. [HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest), [Respond to Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook)
- Tryb streaming wymaga obsługujących go węzłów. Dokumentacja opisuje m.in. AI Agent i Respond to Webhook; nie potwierdza przezroczystego przekazywania strumienia GLB z HTTP Request od pierwszego bajtu. [Streaming](https://docs.n8n.io/build/understand-workflows/understand-executions/stream-real-time-responses.md)
- n8n Cloud ogranicza równoczesne wykonania według planu i kolejkuje nadmiar w FIFO. Dane binarne domyślnie zajmują pamięć. [Cloud concurrency](https://docs.n8n.io/deploy/use-n8n-cloud/understand-concurrency.md), [Binary data](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/handle-binary-data.md)

Wniosek projektowy: workflow na każdy kafelek jest możliwy jako prototyp, lecz nie mamy pomiarów pozwalających uznać go za równie szybki jak obecne bezpośrednie pobieranie. Każdy kafelek uruchamiałby wykonanie workflow i konkurował o jego zasoby.

## Zalecany wariant

Przy self-hosted n8n uruchomić obok niego stale działające proxy Node.js. Reverse proxy z HTTPS kieruje `/terrain/*` do Node, a panel n8n do n8n. Gra pozostaje na GitHub Pages. n8n służy do prywatnej administracji: sprawdzania stanu, odczytu liczników i zatwierdzonych zmian konfiguracji przez chronione API proxy. Dostęp do n8n nie jest częścią żądań każdego kafelka.

Przy n8n Cloud potrzebny jest osobny hosting tego samego proxy. Sam dostęp do panelu Cloud nie daje możliwości uruchomienia obok niego własnego procesu Node; Execute Command nie jest dostępny na Cloud. [Execute Command](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executecommand)

## Wariant z pojedynczym wywołaniem przy starcie

Broker n8n może pobrać endpoint ion z prywatnym tokenem i przekazać grze dostęp do Google. Dalsze kafelki płyną wtedy bezpośrednio od Google, więc n8n nie dodaje pośrednictwa do każdego pobrania podczas lotu. Broker wymaga pomiaru czasu startu i zachowania jednej sesji; dotychczasowe krótkie pomiary healthchecka nie mierzą wydajności workflow.

Ten wariant może ukryć długotrwałą kolejkę tokenów ion, lecz nie ukryje klucza Google ani uprawnień potrzebnych przeglądarce do bezpośredniego pobierania. Pełne ukrycie obu rodzajów kluczy wymaga proxy całego strumienia opisanego niżej. Hash lub obfuskacja tokenu w kliencie nie zapewnia jego poufności: usługa nadal potrzebuje poprawnego oryginalnego poświadczenia.

## Wymagany kontrakt proxy

1. Prawdziwa kolejka ion znajduje się wyłącznie po stronie serwera, np. w `CESIUM_ION_TOKENS`, bez prefiksu `VITE_`. Frontend otrzymuje tylko `VITE_TERRAIN_PROXY_URL` i krótkotrwały identyfikator sesji proxy. Kolejka uwzględnia token główny; rotacja następuje po ion 401, bez przełączania kont po limitach i zwykłych błędach sieci.
2. Proxy pobiera endpoint assetu `2275207`, root Google oraz wszystkie dalsze tilesety, modele i zasoby. Każdy adres zasobu przepisuje na swoją trasę. Nie zwraca klientowi oryginalnego endpointu z kluczem Google ani długotrwałych tokenów w JSON, URL, nagłówkach, przekierowaniach lub błędach.
3. Utrzymuje sesję przez restart, zmianę pojazdu i powrót z kosmosu. Współdzieli równoczesne odnowienie po jednoznacznym wygaśnięciu; brak kafelka, odmowa uprawnień i limit nie tworzą nowego rootu.
4. Pliki binarne przekazuje strumieniem, bez zamiany na Base64 i pełnego buforowania. Zachowuje właściwy `Content-Type`, dane atrybucji i dopuszczone przez dostawcę nagłówki cache. Anulowanie żądania gracza przerywa zbędne pobieranie, lecz nie przerywa współdzielonego odnowienia sesji.
5. Dopuszcza wyłącznie ustalone hosty i ścieżki terenu, waliduje także przekierowania. Obsługuje CORS dla strony gry i preflight. Prywatne API administracji ma osobne uwierzytelnianie, niewysyłane do gry. Limituje nadużycia i usuwa sekrety z logów oraz zapisów wykonania n8n.

## Warunki przełączenia gry

Adres n8n jest już znany. Nadal potrzebne są: wersja i potwierdzenie Cloud/self-hosted, autoryzowany dostęp do konfiguracji workflow oraz, dla pełnego proxy, miejsce i dostęp do wdrożenia z publicznym HTTPS. W wykonanym odczytowym sprawdzeniu lokalnych konfiguracji i pamięci nie potwierdzono dostępnego klucza API n8n; klucz administratora aplikacji Guardian QR jest odrębnym poświadczeniem. Przy self-hosted trzeba potwierdzić zasoby serwera, pasmo i konfigurację reverse proxy. Przy Cloud trzeba sprawdzić plan i równoległość, jeśli rozważamy prototyp przez webhooki.

Przed publikacją sprawdzić brak prawdziwych JWT i klucza Google w buildzie oraz całym ruchu klienta; przepisywanie zagnieżdżonych adresów; poprawne bajty plików; równoległe żądania i anulowanie; zachowanie sesji. Porównać czas do pierwszego ostrego widoku, opóźnienia pobierania i przerwy w klatkach z obecnym rozwiązaniem podczas startu, szybkiego lotu, obrotu o 180° i lądowania. Nie obiecywać braku spowolnienia przed tym pomiarem.

Po udanym przełączeniu usunąć konfigurację JWT z klienta i jego buildów. Wcześniej opublikowane tokeny wymagają cofnięcia i zastąpienia nowymi ograniczonymi tokenami serwera; stare kopie bundle nie stają się prywatne. Osobno przygotować publiczny eksport źródeł bez wybranych modułów i backendu — usunięcie plików z bieżącego commita nie usuwa ich historii.
