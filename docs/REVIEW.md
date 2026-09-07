# Przegląd zmian — 2026-09-05

## Poprawki

- Kodowanie nazw graczy i informacji lobby przed wstawieniem do HTML.
- Odrzucanie poleceń gospodarza pochodzących od gości, ustalanie nadawcy na podstawie połączenia.
- Walidacja typów, współrzędnych, liczb, identyfikatorów modeli, rozmiaru i głębokości wiadomości. Limit wiadomości i 16 miejsc w pokoju.
- Kryptograficzne identyfikatory pokoi i poprawna obsługa miejsca numer 0.
- Odrzucanie połączeń głosowych spoza pokoju; przychodząca rozmowa nie inicjuje prośby o mikrofon.
- Brak konfiguracji po stronie gracza: dostęp do terenu zapewnia publikacja. W razie niedostępności usługi wyświetlany jest komunikat umożliwiający ponowienie próby.
- Powrót do menu przy braku terenu i reset błędnych kafelków przy ponownym starcie.
- Reset klawiszy i drążka po przełączeniu okna; pauza oraz blokada przewijania strzałkami podczas lotu.
- Stabilne współrzędne przy biegunach i południku 180°, poprawiony model zakrętów i wygładzanie zależne od czasu.
- Zwalnianie zasobów modeli i odrzucanie spóźnionych odpowiedzi ładowania.
- Cienie i filtrowanie tekstur ustawiane podczas ładowania kafelka, bez ciągłego przechodzenia całej sceny.
- Profile jakości, rzeczywisty bufor Ultra 4K, adaptacja rozdzielczości, odczyt rozdzielczości i kamera orbitująca.
- Atrybucje terenu z silnika renderowane bez wykonywania HTML dostawcy.
- Wyszukiwanie Photon z timeoutem i kolejką oraz mapa Leaflet / OpenStreetMap z pinezką, bez klucza Google.
- Interfejs online bez formularza tokenów; usunięty skrypt instalacji gry dla Windows. Komendy lokalne pozostają wyłącznie narzędziami deweloperskimi.

## Granice weryfikacji

- Wykonano krótki lot testowy nad Paryżem z istniejącym tokenem Cesium: 199 odpowiedzi kafelków bez błędów, start nad rozpoznanym terenem. Nie jest to benchmark docelowego GPU ani potwierdzenie najwyższej szczegółowości całej mapy. Mapa wyboru pinezki nie wymaga tokenu.
- Multiplayer nadal ufa gospodarzowi; nie ma autorytatywnego serwera ani ochrony przed oszukiwaniem. Walidacja po odebraniu wiadomości nie zastępuje ochrony przed dużymi pakietami.
- Publiczne usługi PeerJS i dotychczasowy publiczny TURN mogą być zawodne; stała usługa powinna korzystać z własnej infrastruktury.
- Fizyka nie obejmuje pełnej aerodynamiki, wiatru, awioniki, startów i lądowań. Rakieta nadal korzysta z uproszczonego kontrolera.
- Obrót kamery wymaga myszy; na telefonie pozostaje dotykowe sterowanie lotem. Kamera nie ma osobnego systemu kolizji z terenem.
- Najwyższa szczegółowość całego świata jednocześnie przekracza zasoby przeglądarki. Dane są strumieniowane; niski SSE zwiększa transfer i wymagania sprzętowe.
- Nie przeprowadzono testu rzeczywistych dwóch klientów, wielogodzinnego lotu ani benchmarku na docelowym GPU.
- Domyślne wyszukiwanie ogranicza ruch w pojedynczej karcie. Publiczne wdrożenie z większym ruchem potrzebuje własnego endpointu z globalnym limitem.
- Zachowano istniejące modele, muzykę i tekstury. Repozytorium nie zawiera pełnej informacji o ich licencjach; właściciel powinien ją uzupełnić przed dystrybucją.

To konkretne poprawki i przegląd, nie deklaracja usunięcia wszystkich możliwych błędów ani formalny audyt bezpieczeństwa.
