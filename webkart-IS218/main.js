// =======================
// Webkart – Agder
// =======================

// 1) Start kartet
const map = L.map("map").setView([59.91, 10.75], 6);
map.doubleClickZoom.disable(); // vi bruker dblclick til reset

// 2) Basiskart (OSM)
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
  maxZoom: 19,
}).addTo(map);

// Layer control
const baseMaps = { OpenStreetMap: osm };
const overlays = {};
const layerControl = L.control.layers(baseMaps, overlays, { collapsed: false }).addTo(map);

// -----------------------
// Popup-stil for fylke
// -----------------------
function formatDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function popupHtml(props) {
  const navn = props.fylkesnavn || props.navn || "Ukjent område";
  const nr = props.fylkesnummer ?? props.fylkenummer ?? "";

  const rows = [
    ["Fylkesnavn", navn],
    ["Fylkesnummer", nr],
    ["Gyldig fra", formatDate(props.gyldigFra)],
    ["Oppdatert", formatDate(props.oppdateringsdato)],
    ["Versjon", props.versjonId ?? ""],
  ];

  const tableRows = rows
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`)
    .join("");

  return `
    <div class="popup">
      <div class="popup-title">${navn}</div>
      <table class="popup-table">${tableRows}</table>
    </div>
  `;
}

function defaultStyle() {
  return { color: "blue", weight: 2, fillOpacity: 0.25, opacity: 1 };
}

function highlightStyle() {
  return { color: "blue", weight: 3, fillOpacity: 0.35, opacity: 1 };
}

// -----------------------
// Romlig filtrering (30 km)
// SHIFT+klikk filtrerer skredlaget
// Dobbelklikk resetter filteret
// -----------------------
let filterCircle = null;
const radiusMeters = 30000;

function setVisible(layer, visible) {
  if (layer.setStyle) {
    layer.setStyle(
      visible
        ? { opacity: 1, fillOpacity: 0.4 }
        : { opacity: 0, fillOpacity: 0 }
    );
  } else if (layer.setOpacity) {
    layer.setOpacity(visible ? 1 : 0);
  }
}

function filterGeoJsonLayerWithinRadius(geoJsonLayer, centerLatLng, radiusMeters) {
  const center = turf.point([centerLatLng.lng, centerLatLng.lat]);

  geoJsonLayer.eachLayer((featureLayer) => {
    const feature = featureLayer.feature;
    if (!feature) return;

    const c = turf.centroid(feature);
    const distKm = turf.distance(center, c, { units: "kilometers" });
    const inside = distKm * 1000 <= radiusMeters;

    setVisible(featureLayer, inside);
  });
}

function resetGeoJsonFilter(geoJsonLayer) {
  geoJsonLayer.eachLayer((featureLayer) => setVisible(featureLayer, true));
  if (filterCircle) {
    map.removeLayer(filterCircle);
    filterCircle = null;
  }
}

// -----------------------
// Lag 1: Fylke (Agder) – GeoJSON
// -----------------------
fetch("data/fylker_agder.geojson")
  .then((res) => {
    if (!res.ok) throw new Error("Fant ikke data/fylker_agder.geojson (404).");
    return res.json();
  })
  .then((data) => {
    const fylkeLayer = L.geoJSON(data, {
      style: defaultStyle,
      onEachFeature: (feature, layer) => {
        layer.bindPopup(popupHtml(feature.properties || {}), { maxWidth: 320 });
        layer.on("mouseover", () => layer.setStyle(highlightStyle()));
        layer.on("mouseout", () => layer.setStyle(defaultStyle()));
      },
    }).addTo(map);

    layerControl.addOverlay(fylkeLayer, "Fylke (GeoJSON)");
    map.fitBounds(fylkeLayer.getBounds(), { padding: [20, 20] });
  })
  .catch((err) => console.error(err));

// -----------------------
// Lag 2: Skredfaresoner – GeoJSON
// Fargekodes: orange = lav/middels, darkred = høy
// SHIFT+klikk filtrerer dette laget innen 30 km
// -----------------------
let skredLayer = null;

fetch("data/skred.geojson")
  .then((res) => {
    if (!res.ok) throw new Error("Fant ikke data/skred.geojson (404).");
    return res.json();
  })
  .then((data) => {
    console.log("Skredfaresoner lastet:", data.features?.length, "objekter");

    skredLayer = L.geoJSON(data, {
      style: (feature) => {
        const p = feature.properties || {};
        const fare = p.faregrad || p.klasse || p.nivaa || p.fare || "";

        const high =
          String(fare).toLowerCase().includes("høy") ||
          String(fare).includes("3") ||
          String(fare).toLowerCase().includes("high");

        return {
          color: high ? "darkred" : "orange",
          weight: 2,
          fillOpacity: 0.35,
        };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const title = p.navn || p.omrade || p.lokalId || "Skredfaresone";
        const fare = p.faregrad || p.klasse || p.nivaa || p.fare || "";
        const type = p.skredtype || p.type || "";
        const opphav = p.opphav || "";
        const dato = formatDate(p.datafangstdato || "");

        layer.bindPopup(`
          <strong>🏔️ ${title}</strong><br>
          ${fare ? `<b>Faregrad:</b> ${fare}<br>` : ""}
          ${type ? `<b>Skredtype:</b> ${type}<br>` : ""}
          ${opphav ? `<b>Kilde:</b> ${opphav}<br>` : ""}
          ${dato ? `<b>Dato:</b> ${dato}` : ""}
        `);
      },
    }).addTo(map);

    layerControl.addOverlay(skredLayer, "Skredfaresoner (GeoJSON)");
  })
  .catch((err) => console.error(err));

// -----------------------
// Lag 3: Fjelltopper i Agder – Kartverket Stedsnavn API (ekstern API)
//
// Vi henter stedsnavn av typen "Fjell" fra Kartverkets åpne API.
// Deretter filtrerer vi client-side til å bare vise de som
// ligger innenfor Agders geografiske grenser.
// -----------------------

const stedsnavnUrl =
  "https://ws.geonorge.no/stedsnavn/v1/navn" +
  "?fnr=42" +
  "&treffPerSide=500" +
  "&side=1";

fetch(stedsnavnUrl)
  .then((res) => {
    if (!res.ok) throw new Error(`Kartverket API feil: ${res.status}`);
    return res.json();
  })
  .then((data) => {
    const alle = data.navn || [];

    // Filtrer til kun fjell/topper på vår side, siden APIet ikke støtter navneobjekttype-filter
    const fjellTyper = ["Fjellområde", "Botn", "Dal", "Dalføre"];
    const agderFjell = alle.filter((sted) =>
      fjellTyper.includes(sted.navneobjekttype)
    );

    console.log("Fjelltopper i Agder:", agderFjell.length);

    const fjellLayerGroup = L.layerGroup();

    agderFjell.forEach((sted) => {
      const punkt = sted.representasjonspunkt;
      if (!punkt) return;

      const navn = sted.skrivemåte || "Ukjent fjell";
      const kommune = sted.kommuner?.[0]?.kommunenavn || "";
      const type = sted.navneobjekttype || "Fjell";

      const marker = L.circleMarker([punkt.nord, punkt.øst], {
        radius: 5,
        color: "#4a235a",
        fillColor: "#9b59b6",
        fillOpacity: 0.85,
        weight: 1,
      });

      marker.bindPopup(`
        <strong>🏔️ ${navn}</strong><br>
        <b>Type:</b> ${type}<br>
        ${kommune ? `<b>Kommune:</b> ${kommune}` : ""}
      `);

      fjellLayerGroup.addLayer(marker);
    });

    fjellLayerGroup.addTo(map);
    layerControl.addOverlay(fjellLayerGroup, "Fjellområder (Kartverket API)");
  })
  .catch((err) => {
    console.error("Klarte ikke laste stedsnavn fra Kartverket:", err);
  });

// -----------------------
// Interaksjon:
// SHIFT+klikk = filtrer skredfaresoner innen 30 km
// Dobbelklikk = reset filter
// -----------------------

map.on("click", (e) => {
  if (!skredLayer) return;
  if (!e.originalEvent.shiftKey) return;

  if (filterCircle) map.removeLayer(filterCircle);
  filterCircle = L.circle(e.latlng, {
    radius: radiusMeters,
    color: "gray",
    fillOpacity: 0.05,
    dashArray: "6",
  }).addTo(map);

  filterGeoJsonLayerWithinRadius(skredLayer, e.latlng, radiusMeters);
});

map.on("dblclick", () => {
  if (!skredLayer) return;
  resetGeoJsonFilter(skredLayer);
});