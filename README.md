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
| Shift / Ctrl | Szybciej / wolniej; w kosmosie hiperprędkość / lot precyzyjny |
| Prawy przycisk myszy i przeciąganie | Obrót kamery |
| Kółko myszy | Zoom |
| C | Reset kamery |
| Esc | Pauza |
| T (przytrzymaj) | Rozmowa multiplayer |
| Spacja | Łagodny, niski start spadochroniarza po lądowaniu |
| R | Szybki start spadochroniarza; rakietą pionowy start na orbitę, a w kosmosie asysta orbitalna |
| 1–9 | W trybie kosmicznym wybór planety i ustawienie kursu |

Na telefonie użyj drążka dotykowego. W multiplayer wyślij znajomemu link do pokoju.

### Spadochroniarz

W karuzeli pojazdów wybierz **Parachutist**. Stabilny, segmentowy model pilota ma osobne pozy dla lotu i marszu, bez podatnej na deformacje siatki szkieletowej. Czasza leci z prędkością około 24–55 km/h: `A/D` steruje zakrętem, `S` zwiększa opadanie i jednocześnie zmniejsza prędkość poziomą, a `W` przywraca szybszą charakterystykę trymową. Tuż nad powierzchnią działa automatyczne wyhamowanie opadania ułatwiające przyziemienie. Maksymalne przybliżenie kółkiem myszy przełącza widok pierwszoosobowy z animowanymi rękami i linkami sterowniczymi. Przyziemienie na rozpoznanej powierzchni ulicy lub płaskiego dachu jest bezpieczne i automatycznie przełącza postać na chodzenie ze stałą prędkością 9 km/h. Na ziemi `W/S` porusza postać, a `A/D` obraca. Zejście z wysokiej krawędzi ponownie otwiera czaszę. `Spacja` lub przycisk **Gentle takeoff** rozpoczyna łagodne wznoszenie o około 12 m, które można od razu przerwać klawiszem `S`. `R` uruchamia szybkie wznoszenie o około 80 m.

Podczas zejścia poniżej 240 m gra zaczyna wcześniej pobierać dokładniejsze kafelki. Po lądowaniu renderer najpierw wyostrza obszar widoczny przed graczem, a potem jedną lekką kamerą stopniowo uzupełnia pozostałe kierunki. Gdy liczba klatek spada albo pamięć podręczna jest pełna, pobieranie tła zatrzymuje się automatycznie. Tekstury zachowują mipmapy i używają maksymalnej dostępnej anizotropii do 16×, dzięki czemu dachy i elewacje oglądane pod kątem pozostają czytelniejsze.

Po lądowaniu przycisk **Enter Street View** najpierw wyjaśnia, że na dachu panorama może zacząć się na najbliższej ulicy. Gra otwiera bezkluczowy adres Google Maps w osobnym oknie i zachowuje ekran powrotu; po powrocie do okna gry `Esc` lub `Spacja` zamyka Street View i wznawia lot z zachowanego miejsca. Rozwiązanie nie korzysta z Maps JavaScript API i nie nalicza opłat za wywołania API. Ograniczenia bezpieczeństwa przeglądarki uniemożliwiają odczyt pozycji z osobnej strony, dlatego spacer wykonany w Google Maps nie zmienia miejsca postaci w grze.

### Rakieta i lot kosmiczny

W jednoosobowym **Free flight** wybierz **Rocket** i naciśnij `R`. Rakieta ustawia się pionowo, przyspiesza do granicy kosmosu i automatycznie przechodzi na widoczną orbitę Ziemi. Panel kosmiczny pozwala wybrać Merkurego, Wenus, Ziemię, Księżyc, Marsa, Jowisza, Saturna, Urana lub Neptuna. Kliknięcie celu albo klawisze `1–9` ustawiają kurs. `W/S` steruje pochyleniem, `A/D` kierunkiem, `Shift` uruchamia hiperprędkość, a `Ctrl` ułatwia precyzyjne podejście. W pobliżu wybranego świata autopilot przechwytuje orbitę; `R` włącza lub wyłącza asystę orbitalną przy najbliższym obiekcie.

Układ Słoneczny powstaje proceduralnie dopiero po osiągnięciu kosmosu. Nie pobiera nowych modeli ani tekstur i nie zużywa dodatkowego limitu API. Odległości i promienie są skompresowane do skali gry, aby lot między planetami trwał kilkanaście sekund. Cesium oferuje osobne powierzchnie 3D Księżyca i Marsa; ich użycie jako trybu lądowania wymagałoby osobnego przełączenia układu współrzędnych i dodatkowego streamingu, dlatego nie są włączane podczas przelotu.

## Grafika

Gra używa jednego profilu **Adaptive high detail** zamiast osobnego trybu 4K. Bufor obrazu może osiągnąć 2560 × 1440, a adaptacja zmniejsza rozdzielczość przy spadkach FPS i przywraca ją, gdy urządzenie znów nadąża. Budżet GPU jest kierowany przede wszystkim na dokładniejsze kafelki terenu w pobliżu postaci.

Szczegóły map doczytują się przez Internet. Gra używa Google Photorealistic 3D Tiles przez asset Cesium ion `2275207`; nie wymaga klucza Google Maps API. Rozdzielczość obrazu nie zwiększa dokładności źródłowej fotogrametrii, więc nie każda elewacja może osiągnąć jakość Street View. Jakość i płynność zależą od zasięgu danych, połączenia oraz GPU. Fizyka pozostaje uproszczonym modelem gry.

## Informacje techniczne

Gracze nie konfigurują usług. Fotorealistyczny teren nadal pochodzi z Cesium / Google, a dostęp zapewnia konfiguracja publikowanej strony. Nie oznacza to całkowitej niezależności od zewnętrznych usług.

Instrukcje utrzymania strony i testów znajdują się w [docs/MAINTENANCE.md](docs/MAINTENANCE.md). [Przegląd poprawek i ograniczeń](docs/REVIEW.md).
