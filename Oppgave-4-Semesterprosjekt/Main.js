// =======================
// Sivil Beredskap – Evakueringsruter Agder
// IS-218 Gruppe 13
// =======================

// Supabase-klient
const cfg = window.SUPABASE_CONFIG || {};
const SUPABASE_URL = cfg.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Supabase ikke konfigurert. Sjekk supabase-config.js");
} else {
  window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// =======================
// Kart
// =======================
const map = L.map("map").setView([58.2, 8.0], 10);
map.doubleClickZoom.disable();

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
  maxZoom: 19,
}).addTo(map);

// =======================
// Hjelpefunksjoner
// =======================
function formatDistance(m) {
  if (m == null || isNaN(m)) return "Ukjent";
  if (m >= 1000) return (m / 1000).toFixed(1) + " km";
  return Math.round(m) + " m";
}

function showInfoPanel(html) {
  document.getElementById("info-content").innerHTML = html;
  document.getElementById("info-panel").classList.remove("hidden");
}

function hideInfoPanel() {
  document.getElementById("info-panel").classList.add("hidden");
}

// =======================
// Lag: Tilfluktsrom
// Lastes ved oppstart fra Supabase
// =======================
const tilfluktsromLayer = L.geoJSON(null, {
  pointToLayer: (feature, latlng) => {
    return L.marker(latlng, {
      icon: L.divIcon({
        className: "",
        html: `<div style="
          background:#1a73e8;
          border:2px solid white;
          border-radius:3px;
          width:14px;
          height:14px;
          box-shadow:0 2px 6px rgba(0,0,0,0.5);
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
    });
  },
  onEachFeature: (feature, layer) => {
    const p = feature.properties || {};
    const adresse = p.adresse || "Ukjent adresse";
    const romnr = p.romnr || "";

    layer.bindPopup(`
      <strong>🛡️ Tilfluktsrom</strong><br>
      <b>Adresse:</b> ${adresse}<br>
      ${romnr ? `<b>Rom nr:</b> ${romnr}` : ""}
    `);
  }
}).addTo(map);

async function lastAlleTilfluktsrom() {
  if (!window.supabaseClient) return;
  try {
    // Stor radius for å dekke hele Agder
    const { data, error } = await window.supabaseClient.rpc("get_shelters_within", {
      lat_in: 58.3,
      lon_in: 7.8,
      radius_m_in: 200000
    });

    if (error) { console.error("Tilfluktsrom feil:", error); return; }

    let fc = Array.isArray(data)
      ? (Object.values(data[0] || {}).find(v => typeof v === "object") || data[0])
      : data;

    if (fc && fc.type === "FeatureCollection") {
      tilfluktsromLayer.addData(fc);
      console.log("Tilfluktsrom lastet:", fc.features?.length);
    }
  } catch (e) {
    console.error("Klarte ikke laste tilfluktsrom:", e);
  }
}

lastAlleTilfluktsrom();

// =======================
// Lag: Evakueringsruter
// Vises når bruker klikker på kartet
// =======================
const ruterLayer = L.geoJSON(null, {
  style: {
    color: "#e74c3c",
    weight: 4,
    opacity: 0.9,
  },
  onEachFeature: (feature, layer) => {
    const p = feature.properties || {};
    const fra = p.krise_navn || "Kriseområde";
    const dist = p.distanse_m ? formatDistance(Number(p.distanse_m)) : "Ukjent";

    layer.bindPopup(`
      <strong>🚗 Evakueringsrute</strong><br>
      <b>Fra:</b> ${fra}<br>
      <b>Kjøreavstand:</b> ${dist}
    `);
  }
}).addTo(map);

// =======================
// Klikk på kart: marker kriseområde + hent ruter
// =======================
let kriseMarker = null;
let kriseCircle = null;

map.on("click", async (e) => {
  const { lat, lng } = e.latlng;

  // Fjern forrige
  if (kriseMarker) map.removeLayer(kriseMarker);
  if (kriseCircle) map.removeLayer(kriseCircle);
  ruterLayer.clearLayers();

  // Vis kriseområde
  kriseCircle = L.circle(e.latlng, {
    radius: 1500,
    color: "#e74c3c",
    fillColor: "#e74c3c",
    fillOpacity: 0.15,
    weight: 2,
  }).addTo(map);

  kriseMarker = L.circleMarker(e.latlng, {
    radius: 6,
    color: "#e74c3c",
    fillColor: "#e74c3c",
    fillOpacity: 1,
    weight: 2,
  }).addTo(map);

  showInfoPanel(`<b>🔍 Søker etter evakueringsruter...</b>`);

  if (!window.supabaseClient) {
    showInfoPanel("⚠️ Supabase ikke konfigurert.");
    return;
  }

  try {
    // Hent alle ruter innenfor 30 km
    const { data: ruteData, error: ruteError } = await window.supabaseClient.rpc("get_routes_within", {
      lat_in: lat,
      lon_in: lng,
      radius_m_in: 30000
    });

    // Hent nærmeste tilfluktsrom til klikk-punktet
    const { data: shelterData, error: shelterError } = await window.supabaseClient.rpc("get_shelters_within", {
      lat_in: lat,
      lon_in: lng,
      radius_m_in: 30000
    });

    if (ruteError) {
      console.error("Rute-feil:", ruteError);
      showInfoPanel("❌ Feil ved henting av ruter.");
      return;
    }

    let ruteFc = Array.isArray(ruteData)
      ? (Object.values(ruteData[0] || {}).find(v => typeof v === "object") || ruteData[0])
      : ruteData;

    let shelterFc = Array.isArray(shelterData)
      ? (Object.values(shelterData[0] || {}).find(v => typeof v === "object") || shelterData[0])
      : shelterData;

    if (ruteFc && ruteFc.type === "FeatureCollection" && ruteFc.features?.length > 0) {

      // Finn nærmeste rute til klikk-punktet basert på startpunkt
      const nærmeste = ruteFc.features.reduce((best, f) => {
        const p = f.properties || {};
        // Avstand fra klikk til kriseområdets startpunkt
        const dLat = (p.krise_lat || 0) - lat;
        const dLng = (p.krise_lon || 0) - lng;
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        return (!best || dist < best.dist) ? { f, dist } : best;
      }, null);

      // Vis bare den nærmeste ruten
      ruterLayer.clearLayers();
      if (nærmeste) ruterLayer.addData(nærmeste.f);

      const p = nærmeste?.f?.properties || {};

      // Finn nærmeste tilfluktsrom til klikk-punktet
      let nærmesteShelter = null;
      let minShelterDist = Infinity;
      if (shelterFc && shelterFc.features?.length > 0) {
        shelterFc.features.forEach(sf => {
          const d = sf.properties?.distance_m;
          if (d != null && d < minShelterDist) {
            minShelterDist = d;
            nærmesteShelter = sf.properties;
          }
        });
      }

      const shelterAdresse = nærmesteShelter?.adresse || "Ukjent";
      const shelterPlasser = nærmesteShelter?.plasser || "Ukjent";
      const shelterAvstand = minShelterDist !== Infinity
        ? formatDistance(minShelterDist)
        : "Ukjent";

      const html = `
        <b>🚨 Kriseområde markert</b><br>
        <small style="color:#aaa">${lat.toFixed(4)}, ${lng.toFixed(4)}</small><br><br>
        <div class="route-item">
          <b>Nærmeste evakueringsrute:</b><br>
          📍 ${p.krise_navn || "Kriseområde"}<br>
          📏 ${formatDistance(p.distanse_m)} kjøreavstand
        </div>
        <div class="shelter-item">
          <b>Nærmeste tilfluktsrom:</b><br>
          🏠 ${shelterAdresse}<br>
          📏 ${shelterAvstand} unna
        </div>
      `;

      showInfoPanel(html);

      // Zoom til ruten
      const bounds = ruterLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });

    } else {
      showInfoPanel(`
        <b>🚨 Kriseområde markert</b><br><br>
        ⚠️ Ingen forhåndsberegnede ruter funnet i nærheten.<br>
        <small style="color:#aaa">Prøv å klikke nærmere Kristiansand-området.</small>
      `);
    }

  } catch (err) {
    console.error(err);
    showInfoPanel("❌ Uventet feil: " + err.message);
  }
});

// =======================
// Nullstill-knapp
// =======================
document.getElementById("reset-btn").addEventListener("click", () => {
  if (kriseMarker) { map.removeLayer(kriseMarker); kriseMarker = null; }
  if (kriseCircle) { map.removeLayer(kriseCircle); kriseCircle = null; }
  ruterLayer.clearLayers();
  hideInfoPanel();
  map.setView([58.2, 8.0], 10);
});

