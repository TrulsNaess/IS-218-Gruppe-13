# Oppgave 4 – Semesterprosjekt

## Hva applikasjonen gjør

Dette er prototypen for semesterprosjektet. Applikasjonen lar brukeren:
- markere et kriseområde ved å klikke på kartet
- tegne et polygon for mer fleksibel krisedefinisjon
- søke etter tilfluktsrom fra Supabase/PostGIS
- beregne evakueringsrute til nærmeste tilfluktsrom utenfor kriseområdet
- vise kapasitet for tilfluktsrom og estimert befolkning i området
- laste tilfluktsrom, videregående skoler og grunnskoler fra backend

## Demonstrasjon

## Demonstrasjon
![Demo av systemet Oppgave 4](demo.gif)

## Teknologi

- Frontend: HTML, CSS, JavaScript
- Kart: Leaflet og Leaflet Draw
- Backend: Supabase med PostgreSQL/PostGIS
- Rute/vegbasert beregning: OpenRouteService

## Hvordan åpne

Åpne `Index.html` i `Oppgave-4-Semesterprosjekt/` med VSCode Live Server eller en lokal webserver.

### Viktig
`supabase-config.js` må inneholde gyldige nøkler for Supabase og OpenRouteService for at datahenting og ruteberegning skal fungere.

## Filene som brukes

- `Index.html` – webapplikasjonens brukergrensesnitt
- `Main.js` – kartlogikk, Supabase-integrasjon og rutehåndtering
- `Style.css` – layout og styling
- `supabase-config.js` – konfigurasjon for Supabase og ORS
- `Logo.png` – applikasjonslogo

## Referanser

- Prosjektskisse: `../Oppgave-3-Prosjektskisse/README.md`
- Oppgave 1: `../Oppgave-1-WebGIS/README.md`
- Oppgave 2: `../Oppgave-2-GIScience/README.md`
- Oppgave 3: `../Oppgave-3-Prosjektskisse/README.md`