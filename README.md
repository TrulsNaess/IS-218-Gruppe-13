# 218-Oppgave-1
Gruppe 13 sin repository for oppgave 1 i IS-218
Prosjektnavn & TLDR 
Kartet vi har laget viser skredfaresoner og fjelltopper i Agder. Det gir viktig informasjon om risiko og sikkerhet, og hjelper til med å unngå områder med skredfare. 

Arkitekturskisse
1. Kilde - Data kommer fra lokale GeoJSON-filer(fylker og skred) eller fra ekstern API (Kartverket)
2. Henting av data - Javascript bruker fetch() til å laste ned GeoJSON-filene og API-dataene
3. Behandling av data - Når dataene er hentet, blir de gjort klare for kartet:
   - GeoJSON-objekter parses
   - Egenskaper brukes til farger, popups og filtrering
   - Fjelltopper filtreres etter type
4. Visning i kartet - Leaflet mottar ferdig behandlet data og legger de inn som kartlag (punkt, polygon osv.).
5. Presentasjon i nettleseren - Kartet rendres i HTML-siden, og brukeren kan zoome, klikke og se popup-informasjon. 
