# Rendering terenu 3D

## Używane źródło

Gra korzysta z assetu Cesium ion `2275207`, czyli Google Photorealistic 3D Tiles przesyłanych przez Cesium. Nie używa klucza Google Maps JavaScript API. Jest to obecnie najlepsze źródło o szerokim, międzynarodowym zasięgu dostępne w tej konfiguracji.

Fotogrametria została wykonana głównie z powietrza. Przy wysokości lotniczej wygląda realistycznie, ale oglądana z kilku metrów może mieć rozmyte elewacje, zdeformowane drzewa i brak drobnych elementów. Zmniejszenie błędu LOD może pobrać najdokładniejszy istniejący kafel, ale nie odtworzy szczegółu, którego nie ma w zdjęciach źródłowych.

## Profil szybkiego wyostrzania

Renderer stosuje progresywny budżet:

1. Najpierw pobiera i dekoduje wyłącznie kafle widoczne przez główną kamerę.
2. Dopasowuje błąd ekranowy LOD oraz liczbę kafli przetwarzanych w klatce do zmierzonego FPS.
3. Kamerę pomocniczą uruchamia dopiero po zakończeniu pobierania bieżącego kadru i przy stabilnej płynności co najmniej około 52 FPS.
4. Kamera pomocnicza doczytuje po jednym kierunku zamiast żądać pełnego pierścienia 360° jednocześnie.
5. Przy spadku FPS lub pełnej pamięci podręcznej doczytywanie niewidocznego tła zostaje wyłączone.
6. Tekstury zachowują mipmapy i korzystają z filtrowania anizotropowego do 16×.

Takie ustawienie szybciej zastępuje rozmyte kafle nadrzędne szczegółowym kaflem bieżącego widoku i ogranicza zacięcia powodowane równoczesnym dekodowaniem wielu kierunków.

## Inne dane Cesium

- **Cesium World Terrain + Bing Maps Aerial + Cesium OSM Buildings** daje czytelne, regularne bryły budynków i globalny zasięg. Nie oferuje jednak fotograficznych elewacji; przy ziemi wygląda bardziej jak czysta makieta 3D niż realne miasto.
- **Vexcel 3D Cities** oferuje wysokiej jakości modele, ale obejmuje wybrane obszary metropolitalne i jest partnerskim, licencjonowanym zbiorem danych.
- **Aerometrex San Francisco High Resolution**, asset `1415196`, obejmuje San Francisco. Udostępniona wersja była niekomercyjną wersją próbną ważną do 18 grudnia 2024 roku, więc nie jest globalnym ani aktualnym zamiennikiem.
- Własne zdjęcia z drona lub skan miasta można przetworzyć i hostować w Cesium ion. To jedyna droga do jakości bliskiej cyfrowemu bliźniakowi w wybranym miejscu, ale wymaga pozyskania danych i osobnego budżetu.

## Limity Cesium ion

Według cennika Cesium ion plan Community jest bezpłatny dla osobistych projektów niekomercyjnych i obejmuje miesięcznie 15 GB streamingu oraz 1 000 głównych kafli Google Photorealistic 3D Tiles. Następny plan Commercial zaczyna się od 149 USD miesięcznie. Przy limicie projektu 10 USD należy pozostać w planie Community i obserwować zużycie; 500 użytkowników mieści się w limicie tylko wtedy, gdy łączna liczba uruchomień pobierających główny kafel nie przekroczy 1 000 miesięcznie.

Aktualne źródła:

- [Cesium ion — cennik i limity](https://cesium.com/platform/cesium-ion/pricing/)
- [Cesium — globalne i partnerskie dane 3D](https://cesium.com/platform/cesium-ion/content/)
- [3D Tiles Renderer — ustawienia LOD i pamięci](https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/master/src/core/renderer/API.md)
