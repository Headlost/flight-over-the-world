# Flight Over the World 2.0 — online

**Graj:** https://headlost.github.io/flight-over-the-world/

Otwórz stronę, wybierz pojazd i rozpocznij **Free flight**. Gracz nie zakłada konta, nie instaluje programu i nie wpisuje żadnych tokenów ani kluczy. Najwięcej nowych możliwości oferują **Parachutist** i **Rocket**: można wylądować, chodzić, ponownie wystartować, wejść na orbitę, odwiedzać planety i odkryć pełną sekwencję czarnej dziury.

## Uruchomienie lokalne

W Windows kliknij dwukrotnie `start-game.cmd`; skrypt zainstaluje brakujące zależności i otworzy grę przez lokalny serwer. Alternatywnie uruchom `npm install`, a następnie `npm start`. Nie otwieraj bezpośrednio pliku `index.html`, ponieważ moduły gry wymagają serwera Vite. Deweloperskie dane dostępu do terenu pozostają w ignorowanym pliku `.env.local`.

## Od wersji 1.0 do 2.0

Wersja 1.0 była punktem startowym zaimportowanym jako fork wcześniejszego projektu. Wersja 2.0 jest gruntowną przebudową doświadczenia, renderowania i mechaniki. Zachowuje ideę swobodnego przelotu nad światem, ale wymienia lub rozbudowuje niemal każdą część widoczną dla gracza:

- jeden prosty tryb **Free flight** zamiast Guess the region i Fly home;
- wybór startu przez tekst, współrzędne lub pinezkę na bezpłatnej mapie OpenStreetMap;
- spadochroniarz z lotem, bezpiecznym lądowaniem na ulicach i dachach, chodzeniem, widokiem pierwszoosobowym i ponownym startem;
- rakieta z pionowym startem, orbitami, hiperprędkością, pełnym Układem Słonecznym i powrotem przez atmosferę Ziemi;
- wejścia atmosferyczne i niskie loty nad teksturowanymi powierzchniami Merkurego, Wenus, Księżyca oraz Marsa;
- proceduralna Droga Mleczna, relatywistyczna czarna dziura, studnia grawitacyjna, odliczanie po utracie telemetrii i rozbudowana sekwencja tesseraktu;
- adaptacyjne doczytywanie terenu, poprawione LOD, kamery, modele, dźwięk i obsługa urządzeń mobilnych.

## Miejsce startu

Wpisz miasto, adres lub współrzędne (np. `48.8584, 2.2945`) albo kliknij **Choose on map**. Na mapie wybierz miejsce i przesuń pinezkę; zatwierdź **Use this location**. Mapa wyboru korzysta z OpenStreetMap i nie wymaga konta Google. Wyszukiwanie obsługuje Photon.

Wybrane miejsce jest startem Free flight. W multiplayer lokalizację wybiera gospodarz.

## Sterowanie

| Klawisz / gest | Działanie |
| --- | --- |
| W / S | Nos w dół / w górę |
| A / D | Przechylenie i zakręt |
| Shift / Ctrl | Szybciej / wolniej; w kosmosie hiperprędkość / lot precyzyjny |
| Prawy przycisk myszy i przeciąganie | Obrót kamery; w kosmosie działa też lewy przycisk |
| Kółko myszy | Zoom |
| C | Reset kamery |
| Esc | Pauza |
| T (przytrzymaj) | Rozmowa multiplayer |
| Spacja | Łagodny, niski start spadochroniarza po lądowaniu |
| R | Szybki start spadochroniarza; rakietą pionowy start na orbitę, a w kosmosie asysta orbitalna |
| 1–9 | W trybie kosmicznym wybór planety i ustawienie kursu |
| E | Wejście w atmosferę i lot nad powierzchnią planety albo powrót przez atmosferę Ziemi |
| 0 / − | Kurs na centrum Drogi Mlecznej / Słońce |

Na telefonie użyj drążka dotykowego. W multiplayer wyślij znajomemu link do pokoju.

### Spadochroniarz

W karuzeli pojazdów wybierz **Parachutist**. Stabilny, segmentowy model pilota ma osobne pozy dla lotu i marszu, bez podatnej na deformacje siatki szkieletowej. Czasza leci z prędkością około 24–55 km/h: `A/D` steruje zakrętem, `S` zwiększa opadanie i jednocześnie zmniejsza prędkość poziomą, a `W` przywraca szybszą charakterystykę trymową. Tuż nad powierzchnią działa automatyczne wyhamowanie opadania ułatwiające przyziemienie. Maksymalne przybliżenie kółkiem myszy przełącza widok pierwszoosobowy z animowanymi rękami i linkami sterowniczymi. Przyziemienie na rozpoznanej powierzchni ulicy lub płaskiego dachu jest bezpieczne i automatycznie przełącza postać na chodzenie ze stałą prędkością 9 km/h. Na ziemi `W/S` porusza postać, a `A/D` obraca. Zejście z wysokiej krawędzi ponownie otwiera czaszę. `Spacja` lub przycisk **Gentle takeoff** rozpoczyna łagodne wznoszenie o około 12 m, które można od razu przerwać klawiszem `S`. `R` uruchamia szybkie wznoszenie o około 80 m.

Podczas zejścia poniżej 240 m gra zaczyna wcześniej pobierać dokładniejsze kafelki. Po lądowaniu renderer najpierw wyostrza obszar widoczny przed graczem, a potem jedną lekką kamerą stopniowo uzupełnia pozostałe kierunki. Gdy liczba klatek spada albo pamięć podręczna jest pełna, pobieranie tła zatrzymuje się automatycznie. Tekstury zachowują mipmapy i używają maksymalnej dostępnej anizotropii do 16×, dzięki czemu dachy i elewacje oglądane pod kątem pozostają czytelniejsze.

Po lądowaniu przycisk **Enter Street View** najpierw wyjaśnia, że na dachu panorama może zacząć się na najbliższej ulicy. Gra otwiera bezkluczowy adres Google Maps w osobnym oknie i zachowuje ekran powrotu. Widoczny ponad całą warstwą przycisk **Return to game**, `Esc` lub `Spacja` wznawiają lot z zachowanego miejsca; zamknięcie Google Maps również automatycznie przywraca grę po powrocie do jej karty. Rozwiązanie nie korzysta z Maps JavaScript API i nie nalicza opłat za wywołania API. Ograniczenia bezpieczeństwa przeglądarki uniemożliwiają odczyt pozycji z osobnej strony, dlatego spacer wykonany w Google Maps nie zmienia miejsca postaci w grze.

### Rakieta i lot kosmiczny

W jednoosobowym **Free flight** wybierz **Rocket** i naciśnij `R`. Rakieta ustawia się pionowo, a bliska kamera pościgowa podąża tuż za nią podczas przyspieszania do granicy kosmosu. Wraz ze wzrostem wysokości niebo płynnie ciemnieje, zanim widok przejdzie na orbitę Ziemi. Panel kosmiczny pozwala wybrać Merkurego, Wenus, Ziemię, Księżyc, Marsa, Jowisza, Saturna, Urana, Neptuna, Słońce lub centrum Drogi Mlecznej. Kliknięcie celu albo klawisze `1–9`, `−` i `0` ustawiają kurs. `W/S` steruje pochyleniem, `A/D` kierunkiem, `Shift` uruchamia hiperprędkość, a `Ctrl` ułatwia precyzyjne podejście. W pobliżu wybranego świata autopilot przechwytuje orbitę; `R` włącza lub wyłącza asystę orbitalną przy najbliższym obiekcie.

Na orbicie `E` lub przycisk pod listą celów rozpoczyna filmowe wejście atmosferyczne z przybliżeniem, smugami i poświatą właściwą dla wybranego świata. Na Merkurym, Wenus, Księżycu i Marsie prowadzenie przechodzi płynnie w lot tuż nad zakrzywioną, teksturowaną powierzchnią. `W/S` reguluje wysokość, `A/D` kierunek, `Shift` przyspiesza w bezpiecznym zakresie, a `R` ponownie wynosi rakietę na orbitę. Gazowe olbrzymy nie mają stałej powierzchni — zejście pod warstwę chmur kończy się zniszczeniem przez ciśnienie. Powrót z orbity Ziemi zaczyna się na wysokości 100 km, a poniżej 6 km oddaje sterowanie graczowi i ponownie uruchamia fotorealistyczny renderer terenu.

Zbliżenie do Słońca pokazuje ostrzeżenie o skrajnym cieple, a przekroczenie powierzchni niszczy rakietę. Centrum proceduralnej Drogi Mlecznej zawiera czarną dziurę renderowaną shaderem z integracją geodezyjnych Schwarzschilda, soczewkowaniem, asymetrią Dopplera, przesunięciem grawitacyjnym, pierścieniem fotonowym i turbulentnym dyskiem akrecyjnym. W studni grawitacyjnej tor lotu jest coraz silniej zakrzywiany ku centrum. Po wejściu w dysk napęd nadświetlny przestaje działać, a wydostanie się staje się bardzo trudne.

W promieniu 9500 jednostek od centrum zaczyna narastać osobna ścieżka muzyczna. Po przekroczeniu horyzontu uruchamia się 15-sekundowa, proceduralna sekwencja: odległy punkt szybko rośnie do rozmiaru ekranu, wybucha złoto-białym światłem, a następnie kamera przelatuje przez nieskończony teserakt złożony z rekurencyjnych metalowych ram, bocznych korytarzy, turkusowych pasów światła i pyłu. Podczas właściwego przelotu można przeciągać myszą lub palcem, aby rozglądać się po strukturze w 360°.

Po sekwencji rakieta pojawia się na rzeczywistym polu zdjęciowym farmy Coopera pod Longview w Albercie (`50°24′23.1″ N, 114°12′15.4″ W`). Panel na ekranie otwiera [referencyjny widok miejsca w Google Maps](https://www.google.com/maps/place/Interstellar+farm/@50.4067956,-114.2067948,582m/data=!3m1!1e3!4m12!1m5!3m4!2zNTDCsDI0JzIzLjEiTiAxMTTCsDEyJzE1LjQiVw!8m2!3d50.406424!4d-114.204275!3m5!1s0x5371cb000edab3e1:0xda2ffa5756ef5f40!8m2!3d50.4064515!4d-114.2041817!16s%2Fg%2F11ww8p8t3p); jest to zwykły odnośnik, bez Maps JavaScript API. `R` uruchamia ponowny pionowy start na orbitę Ziemi, a `0` pozwala obrać kurs z powrotem ku czarnej dziurze. Filmowy dom był dekoracją i został po zdjęciach rozebrany.

Geometria orbit, atmosfer, galaktyki i czarnej dziury powstaje proceduralnie dopiero po osiągnięciu kosmosu. Shader czarnej dziury jest adaptacją technik z projektu [Adriwin06/black-hole](https://github.com/Adriwin06/black-hole) i jego źródła `oseiskar/black-hole`, udostępnionych na licencji MIT; pełne informacje są w [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Powierzchnie planet, Słońca i Księżyca, chmury Ziemi, atmosfera Wenus, pierścienie Saturna i panorama Drogi Mlecznej korzystają z lokalnie dołączonych map 2K [Solar System Scope](https://www.solarsystemscope.com/textures/), opartych na danych NASA i udostępnionych na licencji CC BY 4.0. Nie wykonują dodatkowych wywołań API. Odległości i promienie są skompresowane do skali gry, aby lot między planetami trwał kilkanaście sekund.

## Muzyka i dźwięk

- Muzyka tła: **Reflection** (`public/music/reflection.mp3`), odtwarzana podczas zwykłego lotu.
- Sekwencja czarnej dziury: **Hans Zimmer — No Time for Caution**, z albumu *Interstellar: Original Motion Picture Soundtrack* (`public/music/no-time-for-caution.mp3`). Głośność utworu narasta wraz ze zbliżaniem się do centrum, a finał jest synchronizowany z przejściem przez horyzont i tesserakt.
- Dźwięki silników, strumienia powietrza i eksplozji są generowane lub miksowane w czasie rzeczywistym przez moduły audio gry.

Pliki muzyczne zostały dostarczone przez właściciela repozytorium. Repozytorium nie nadaje licencji do ponownego wykorzystania tych nagrań; osoba publikująca wdrożenie odpowiada za posiadanie praw wymaganych do ich publicznego odtwarzania.

## Grafika

Gra używa jednego profilu **Adaptive high detail** zamiast osobnego trybu 4K. Bufor obrazu może osiągnąć 2560 × 1440, a adaptacja zmniejsza rozdzielczość przy spadkach FPS i przywraca ją, gdy urządzenie znów nadąża. Budżet GPU jest kierowany przede wszystkim na dokładniejsze kafelki terenu w pobliżu postaci.

Szczegóły map doczytują się przez Internet. Gra używa Google Photorealistic 3D Tiles przez asset Cesium ion `2275207`; nie wymaga klucza Google Maps API. Rozdzielczość obrazu nie zwiększa dokładności źródłowej fotogrametrii, więc nie każda elewacja może osiągnąć jakość Street View. Jakość i płynność zależą od zasięgu danych, połączenia oraz GPU. Fizyka pozostaje uproszczonym modelem gry.

## Informacje techniczne

Gracze nie konfigurują usług. Fotorealistyczny teren nadal pochodzi z Cesium / Google, a dostęp zapewnia konfiguracja publikowanej strony. Nie oznacza to całkowitej niezależności od zewnętrznych usług.

Instrukcje utrzymania strony i testów znajdują się w [docs/MAINTENANCE.md](docs/MAINTENANCE.md). [Przegląd poprawek i ograniczeń](docs/REVIEW.md).
