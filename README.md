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
| Shift / Ctrl | Szybciej / wolniej (w locie) |
| Prawy przycisk myszy i przeciąganie | Obrót kamery |
| Kółko myszy | Zoom |
| C | Reset kamery |
| Esc | Pauza |
| T (przytrzymaj) | Rozmowa multiplayer |
| Spacja | Łagodny, niski start spadochroniarza po lądowaniu |
| R | Szybki start spadochroniarza na pułap przelotowy |

Na telefonie użyj drążka dotykowego. W multiplayer wyślij znajomemu link do pokoju.

### Spadochroniarz

W karuzeli pojazdów wybierz **Parachutist**. Stabilny, segmentowy model pilota ma osobne pozy dla lotu i marszu, bez podatnej na deformacje siatki szkieletowej. Czasza leci z prędkością około 24–55 km/h: `A/D` steruje zakrętem, `S` zwiększa opadanie i jednocześnie zmniejsza prędkość poziomą, a `W` przywraca szybszą charakterystykę trymową. Tuż nad powierzchnią działa automatyczne wyhamowanie opadania ułatwiające przyziemienie. Maksymalne przybliżenie kółkiem myszy przełącza widok pierwszoosobowy z animowanymi rękami i linkami sterowniczymi. Przyziemienie na rozpoznanej powierzchni ulicy lub płaskiego dachu jest bezpieczne i automatycznie przełącza postać na chodzenie ze stałą prędkością 9 km/h. Na ziemi `W/S` porusza postać, a `A/D` obraca. Zejście z wysokiej krawędzi ponownie otwiera czaszę. `Spacja` lub przycisk **Gentle takeoff** rozpoczyna łagodne wznoszenie o około 12 m, które można od razu przerwać klawiszem `S`. `R` uruchamia szybkie wznoszenie o około 80 m.

Podczas zejścia poniżej 240 m gra zaczyna wcześniej pobierać dokładniejsze kafelki. Po lądowaniu dodatkowa kamera od razu uzupełnia otoczenie w czterech kierunkach, a profil naziemny zachowuje pobrane kafle dłużej i utrzymuje postać 32 cm nad zmieniającą się powierzchnią LOD. Tekstury używają maksymalnej dostępnej anizotropii do 16×.

Po lądowaniu przycisk **Enter Street View** najpierw wyjaśnia sterowanie i informuje, że na dachu panorama może zacząć się na najbliższej ulicy. Gdy hosting ma skonfigurowany ograniczony do domeny klucz `VITE_GOOGLE_MAPS_KEY`, panorama działa wewnątrz gry: `W/S` przechodzi między panoramami, `A/D` obraca widok, `Esc` lub `Spacja` wraca do lotu, a bieżąca pozycja i kierunek są przenoszone do postaci. Gracz nigdy nie wpisuje klucza. Bez tej konfiguracji gra otwiera bezkluczowy adres Google Maps w osobnym oknie i zachowuje ekran powrotu; po powrocie do okna gry `Esc` lub `Spacja` zamyka Street View i wznawia lot z zachowanego miejsca. Ograniczenia bezpieczeństwa przeglądarki uniemożliwiają wtedy odczyt pozycji z osobnej strony.

## Grafika

Gra używa jednego profilu **Adaptive high detail** zamiast osobnego trybu 4K. Bufor obrazu może osiągnąć 2560 × 1440, a adaptacja zmniejsza rozdzielczość przy spadkach FPS i przywraca ją, gdy urządzenie znów nadąża. Budżet GPU jest kierowany przede wszystkim na dokładniejsze kafelki terenu w pobliżu postaci.

Szczegóły map doczytują się przez Internet. Rozdzielczość obrazu nie zwiększa dokładności źródłowej fotogrametrii; jakość i płynność zależą od zasięgu danych, połączenia oraz GPU. Fizyka pozostaje uproszczonym modelem gry.

## Informacje techniczne

Gracze nie konfigurują usług. Fotorealistyczny teren nadal pochodzi z Cesium / Google, a dostęp zapewnia konfiguracja publikowanej strony. Nie oznacza to całkowitej niezależności od zewnętrznych usług.

Instrukcje utrzymania strony i testów znajdują się w [docs/MAINTENANCE.md](docs/MAINTENANCE.md). [Przegląd poprawek i ograniczeń](docs/REVIEW.md).
