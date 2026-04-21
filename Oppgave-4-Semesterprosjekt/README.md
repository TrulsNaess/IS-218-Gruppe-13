# Oppgave 4 – Semesterprosjekt

## Status
Under utvikling. Oppgaven skal resultere i:

1. ✅ En teknisk webløsning som visualiserer kriseområder og tilfluktsrom
2. ⏳ En rapport (PDF, maks 10 sider) som beskriver:
   - Problemstilling og valgt fordypningsområde
   - Arbeidsprosess
   - Utfordringer og løsninger
   - Kompleksitet i prosjektet
   - Kvalitetskriterier og sikring av kvalitet
   - Beskrivelse av løsning med bilder/utsnitt
   - Sentrale valg (datasett, teknologi, analyser, algoritmer)
   - Link til teknisk løsning med demo (video/GIF) og GitHub-repo
   - Diskusjon, refleksjon og lærdom
   - Forbedringspunkter og kjente svakheter
   - Konklusjon og referanser

## Prosjektstruktur
```
Oppgave-4-Semesterprosjekt/
├── README.md (denne filen)
├── rapport.pdf (endelig rapport)
├── webkart/ (vidareutviklet webkart)
│   └── ...
├── database/ (scripts for dataimport)
│   └── ...
├── docs/ (dokumentasjon og bilder)
│   └── ...
└── demo/ (video/GIF av løsningen)
    └── ...
```

## Neste steg
1. Importer tilfluktsrom-data (GML) til Supabase
2. Implementer tegneverksamling (polygon/sirkel) i Leaflet
3. Implementer routingberegning fra kriseområde til tilfluktsrom
4. Visualiser ruter og tilfluktsrom-informasjon på kartet
5. Dokumenter prosess og skrive rapport

## Referanser
- Prosjektskisse: `../Oppgave-3-Prosjektskisse/README.md`
- Oppgave 1 (WebGIS): `../Oppgave-1-WebGIS/README.md`
- Oppgave 2 (GIScience): `../Oppgave-2-GIScience/README.md`
