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

// -----------------------
// Supabase spatial RPC: normalt klikk (uten SHIFT)
// Sender lat/lon til Supabase-funksjonen `get_features_within`
// og viser resultatet som et GeoJSON-lag.
// -----------------------
let clickMarker = null;
let clickCircle = null;
let lastClickLatLng = null;

// Wire up optional UI elements (may not exist in older pages)
const radiusInput = document.getElementById("radiusInput");
const radiusValue = document.getElementById("radiusValue");
const adaptiveCheckbox = document.getElementById("adaptiveRadius");

function getBaseRadius() {
  if (radiusInput) return parseInt(radiusInput.value, 10) || 30000;
  return 30000;
}

function formatDistance(m) {
  if (m == null || isNaN(m)) return "";
  if (m >= 1000) return (m / 1000).toFixed(1) + " km";
  return Math.round(m) + " m";
}

// reflect slider value in UI
if (radiusInput && radiusValue) {
  radiusValue.textContent = radiusInput.value;
  radiusInput.addEventListener("input", () => {
    radiusValue.textContent = radiusInput.value;
  });
}

function computeSearchRadius() {
  const base = getBaseRadius();
  if (adaptiveCheckbox && adaptiveCheckbox.checked) {
    // simple adaptive rule: shrink radius at higher zooms
    const zoom = map.getZoom();
    // zoom 6 -> factor ~4, zoom 12 -> factor ~1
    const factor = Math.max(0.5, Math.pow(2, (10 - zoom) / 4));
    return Math.round(base * factor);
  }
  return base;
}

const rpcResultLayer = L.geoJSON(null, {
  style: (feat) => ({
    color: "#ffcc00",
    weight: 3,
    fillOpacity: 0.25,
  }),
  onEachFeature: (feature, layer) => {
    const props = feature.properties || {};
    const title = props.navn || props.lokalId || props.id || "Resultat";

    // distance may come from server (distance_m) or we compute using turf from lastClickLatLng
    let distLabel = "";
    if (props.distance_m !== undefined && props.distance_m !== null) {
      distLabel = formatDistance(Number(props.distance_m));
    } else if (lastClickLatLng) {
      try {
        const centroid = turf.centroid(feature);
        const dd = turf.distance(turf.point([lastClickLatLng.lng, lastClickLatLng.lat]), centroid, { units: "kilometers" }) * 1000;
        distLabel = formatDistance(dd);
      } catch (e) {
        distLabel = "";
      }
    }

    // Build a compact popup: name + properties (without geometry) + distance
    const propCopy = { ...props };
    delete propCopy.geometry;
    const propText = Object.keys(propCopy).length ? `<pre>${JSON.stringify(propCopy, null, 2)}</pre>` : "";
    const distanceHtml = distLabel ? `<div><strong>Avstand:</strong> ${distLabel}</div>` : "";

    layer.bindPopup(`<strong>${title}</strong>${distanceHtml}${propText}`);
  },
}).addTo(map);

map.on("click", async (e) => {
  // Unngå å håndtere SHIFT-klikk her (det håndteres av eksisterende handler)
  if (e.originalEvent.shiftKey) return;

  lastClickLatLng = e.latlng;

  // Vis markør og ring
  if (clickMarker) map.removeLayer(clickMarker);
  if (clickCircle) map.removeLayer(clickCircle);

  const radiusToUse = computeSearchRadius();

  clickMarker = L.marker(e.latlng).addTo(map);
  clickCircle = L.circle(e.latlng, {
    radius: radiusToUse,
    color: "gray",
    fillOpacity: 0.03,
    dashArray: "6",
  }).addTo(map);

  // Kall Supabase RPC-funksjon
  try {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    if (!window.supabase) {
      console.warn("Supabase-klient ikke initialisert. Sjekk index.html for SUPABASE_URL og SUPABASE_ANON_KEY.");
      alert("Supabase ikke konfigurert. Se konsollen for detaljer.");
      return;
    }

    const { data, error } = await window.supabase.rpc("get_features_within", {
      lat_in: lat,
      lon_in: lon,
      radius_m_in: radiusToUse,
    });

    if (error) {
      console.error("RPC-feil:", error);
      alert("Feil ved spørring mot Supabase: " + error.message);
      return;
    }

    // Supabase RPC returnerer ofte et array med ett element når returntypen er jsonb
    let fc = null;
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
      const first = data[0];
      const val = Object.values(first).find((v) => typeof v === "object");
      fc = val || first;
    } else {
      fc = data;
    }

    rpcResultLayer.clearLayers();
    let minDist = null;
    if (fc && fc.type === "FeatureCollection" && Array.isArray(fc.features)) {
      rpcResultLayer.addData(fc);
      // Finn nærmeste avstand
      fc.features.forEach(f => {
        const d = f.properties && typeof f.properties.distance_m === 'number' ? f.properties.distance_m : null;
        if (d !== null && (minDist === null || d < minDist)) minDist = d;
      });
      // Popup med antall og nærmeste avstand
      const popupContent = `<b>Antall skred:</b> ${fc.features.length}<br>` +
        (minDist !== null ? `<b>Nærmeste skred:</b> ${formatDistance(minDist)}` : "");
      clickMarker.bindPopup(popupContent).openPopup();
      // Safely get bounds and check validity across Leaflet versions
      const bounds = rpcResultLayer.getBounds ? rpcResultLayer.getBounds() : null;
      if (bounds && typeof bounds.isValid === "function" ? bounds.isValid() : (bounds && Object.keys(bounds).length)) {
        map.fitBounds(bounds, { maxZoom: 14 });
      }
    } else {
      clickMarker.bindPopup("Ingen treff innenfor radiusen.").openPopup();
      console.log("Tomt eller uventet resultat fra Supabase:", fc);
    }
  } catch (err) {
    console.error(err);
    alert("Uventet feil ved søk: " + err.message);
  }
});

map.on("dblclick", () => {
  if (!skredLayer) return;
  resetGeoJsonFilter(skredLayer);
});

// -----------------------
// Lag 4: Omvei ved skredfare – GeoJSON
// -----------------------
fetch("data/omvei.geojson")
  .then(res => res.json())
  .then(data => {
    const omveiLayer = L.geoJSON(data, {
      style: { color: "green", weight: 4 }
    }).addTo(map);

    layerControl.addOverlay(omveiLayer, "Skarpenglad - Omvei ved skredfare");
  })
  .catch(err => console.error(err));


  // -----------------------
// Lag: Bro (egen GeoJSON)
// -----------------------
fetch("data/bro.geojson")
  .then(res => res.json())
  .then(data => {
    const broLayer = L.geoJSON(data, {
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 5,
          color: "green",
          fillColor: "green",
          fillOpacity: 0.9
        });
      }
    }).addTo(map);

    layerControl.addOverlay(broLayer, "Vennesla - Bro for omvei ved skredfare");
  })
  .catch(err => console.error(err));

// -----------------------
// Lag: Møtepunkt
// -----------------------
fetch("data/Møtepunkt.geojson")
  .then(res => res.json())
  .then(data => {
    const møtepunktLayer = L.geoJSON(data, {
      onEachFeature: (feature, layer) => {
        layer.bindPopup("Møtepunkt");
      }
    }).addTo(map);

    layerControl.addOverlay(møtepunktLayer, " Vennesla - Møtepunkt ved evakuering");
  })
  .catch(err => console.error(err));


// -----------------------
// Lag: Møtepunkt
// -----------------------

fetch("data/Skarengland.geojson")
  .then(res => res.json())
  .then(data => {
    const møtepunktLayer = L.geoJSON(data, {
      onEachFeature: (feature, layer) => {
        layer.bindPopup("Møtepunkt");
      }
    }).addTo(map);

    layerControl.addOverlay(møtepunktLayer, " Skarengland - Møtepunkt ved evakuering");
  })
  .catch(err => console.error(err));
