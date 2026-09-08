# Flight Over the World — online

**Graj:** https://headlost.github.io/flight-over-the-world/

Otwórz stronę, wybierz samolot lub spadochroniarza i wystartuj. Gracz nie zakłada konta, nie instaluje programu i nie wpisuje żadnych tokenów ani kluczy.

## Miejsce startu

Wpisz miasto, adres lub współrzędne (np. `48.8584, 2.2945`) albo kliknij **Choose on map**. Na mapie wybierz miejsce i przesuń pinezkę; zatwierdź **Use this location**. Mapa wyboru korzysta z OpenStreetMap i nie wymaga konta Google. Wyszukiwanie obsługuje Photon.

W Free flight wybrane miejsce jest startem. W Fly home jest celem, a start znajduje się 20–30 km od niego. Guess the region losuje lokalizację. W multiplayer miejsce wybiera gospodarz.

## Sterowanie

| Klawisz / gest | Działanie |
| --- | --- |
| W / S | Nos w dół / w górę |
| A / D | Przechylenie i zakręt |
| Shift / Ctrl | Szybciej / wolniej |
| Prawy przycisk myszy i przeciąganie | Obrót kamery |
| Kółko myszy | Zoom |
| C | Reset kamery |
| Esc | Pauza |
| T (przytrzymaj) | Rozmowa multiplayer |
| Spacja | Ponowny start spadochroniarza po lądowaniu |

Na telefonie użyj drążka dotykowego. W multiplayer wyślij znajomemu link do pokoju.

### Spadochroniarz

W karuzeli pojazdów wybierz **Parachutist**. Stabilny, segmentowy model pilota ma osobne pozy dla lotu, marszu i biegu, bez podatnej na deformacje siatki szkieletowej. Czasza leci z prędkością około 24–55 km/h: `A/D` steruje zakrętem, `S` zwiększa opadanie i jednocześnie zmniejsza prędkość poziomą, a `W` przywraca szybszą charakterystykę trymową. Tuż nad powierzchnią działa automatyczne wyhamowanie opadania ułatwiające przyziemienie. Maksymalne przybliżenie kółkiem myszy przełącza widok pierwszoosobowy z rękami i linkami sterowniczymi. Przyziemienie na rozpoznanej powierzchni ulicy lub płaskiego dachu jest bezpieczne i automatycznie przełącza postać na chodzenie. Na ziemi `W/S` porusza postać, `A/D` obraca, a `Shift` uruchamia bieg. Zejście z wysokiej krawędzi ponownie otwiera czaszę. `Spacja` lub przycisk **Relaunch** rozpoczyna kontrolowane wznoszenie i pozwala kontynuować lot.

Podczas zejścia poniżej 240 m gra zaczyna wcześniej pobierać dokładniejsze kafelki. Po lądowaniu najpierw ładuje bieżący kadr, a tryb Ultra następnie uzupełnia otoczenie w czterech kierunkach. Profil naziemny zachowuje pobrane kafle dłużej i utrzymuje postać 32 cm nad zmieniającą się powierzchnią LOD. Fotogrametria 3D nie zawiera panoram Street View, dlatego po lądowaniu dostępny jest także przycisk **Open actual Street View**. Otwiera on najbliższą panoramę w Google Maps dla bieżących współrzędnych i kierunku, bez klucza Google API.

## Grafika

**Performance** jest domyślnym i zalecanym trybem. Opcjonalny **Ultra 4K** celuje w bufor 3840 × 2160 przy proporcjach 16:9, ale jest bardzo wymagający i może powodować spadki płynności. Adapt resolution zmniejsza rozdzielczość przy spadkach FPS i przywraca ją, gdy urządzenie nadąża. Aby utrzymać docelowe 4K, wyłącz adaptację.

Szczegóły map doczytują się przez Internet. Rozdzielczość obrazu nie zwiększa dokładności źródłowej fotogrametrii; jakość i płynność zależą od zasięgu danych, połączenia oraz GPU. Fizyka pozostaje uproszczonym modelem gry.

## Informacje techniczne

Gracze nie konfigurują usług. Fotorealistyczny teren nadal pochodzi z Cesium / Google, a dostęp zapewnia konfiguracja publikowanej strony. Nie oznacza to całkowitej niezależności od zewnętrznych usług.

Instrukcje utrzymania strony i testów znajdują się w [docs/MAINTENANCE.md](docs/MAINTENANCE.md). [Przegląd poprawek i ograniczeń](docs/REVIEW.md).
