// =======================
// SøkDekning – Evakueringsruter Agder
// IS-218 Gruppe 13
// =======================
 
const cfg = window.SUPABASE_CONFIG || {};
const SUPABASE_URL = cfg.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY || "";
const ORS_API_KEY = cfg.ORS_API_KEY || "";
 
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Supabase ikke konfigurert.");
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
// Globale variabler
// =======================
let kriseMarker = null;
let kriseCircle = null;
let destinasjonMarker = null;
let ruteLayer = null;
let luftlinjeLag = null;
 
let polygonDrawer = null;
let drawnPolygon = null;
let polygonMode = false;
 
let crisisCenter = null;
let crisisRadius = null;
let crisisIsPolygon = false;
 
let evacSelectMode = false;
let evacStartMarker = null;
let evacRouteLayer = null;
let evacDestMarker = null;
 
const slider = document.getElementById("radius-slider");
const radiusValue = document.getElementById("radius-value");
 
// =======================
// Hjelpefunksjoner
// =======================
function formatDistance(m) {
  if (m == null || isNaN(m)) return "Ukjent";
  if (m >= 1000) return (m / 1000).toFixed(1) + " km";
  return Math.round(m) + " m";
}
 
function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return "Ukjent";
  const min = Math.round(seconds / 60);
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return `${h} t ${rest} min`;
}
 
function showInfoPanel(html) {
  document.getElementById("info-content").innerHTML = html;
  document.getElementById("info-panel").classList.remove("hidden");
}
 
function hideInfoPanel() {
  document.getElementById("info-panel").classList.add("hidden");
}
 
function sliderToRadius(sliderValue) {
  const minR = 100;
  const maxR = 20000;
  const fraction = sliderValue / 100;
  const radius = minR * Math.pow(maxR / minR, fraction);
  return Math.round(radius);
}
 
function pointInPolygon(point, vs) {
  let x = point.lng, y = point.lat;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i].lng, yi = vs[i].lat;
    let xj = vs[j].lng, yj = vs[j].lat;
    let intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
 
function pointInCircle(point, center, radiusMeters) {
  const R = 6371000;
  const dLat = (point.lat - center.lat) * Math.PI / 180;
  const dLng = (point.lng - center.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(center.lat * Math.PI/180) *
            Math.cos(point.lat * Math.PI/180) *
            Math.sin(dLng/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c <= radiusMeters;
}
 
function isPointInsideCrisis(point) {
  if (crisisIsPolygon && drawnPolygon) {
    const latlngs = drawnPolygon.getLatLngs()[0];
    return pointInPolygon(point, latlngs);
  }
  if (!crisisIsPolygon && crisisCenter && crisisRadius != null) {
    return pointInCircle(point, crisisCenter, crisisRadius);
  }
  return false;
}
 
function safeNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, "").replace(/,/g, ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function bytesToHex(bytes) {
  if (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer)) return null;
  const buffer = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  if (typeof hex !== "string") return null;
  const cleaned = hex.trim().replace(/^0x/i, "");
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substr(i, 2), 16);
  }
  return bytes;
}

function parseWkbToGeoJSON(wkbHex) {
  if (!wkbHex) return null;
  if (typeof wkbHex === "object" && wkbHex.type && wkbHex.coordinates) {
    return wkbHex;
  }

  let bytes = null;
  if (typeof wkbHex === "string") {
    bytes = hexToBytes(wkbHex);
  } else if (wkbHex instanceof ArrayBuffer || wkbHex instanceof Uint8Array) {
    bytes = wkbHex instanceof Uint8Array ? wkbHex : new Uint8Array(wkbHex);
  } else if (wkbHex && wkbHex.data) {
    bytes = new Uint8Array(wkbHex.data);
  }

  if (!bytes) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = view.getUint8(0) === 1;
  let offset = 1;
  let geomType = view.getUint32(offset, littleEndian);
  offset += 4;
  let srid = null;

  const hasSrid = (geomType & 0x20000000) !== 0;
  if (hasSrid) {
    srid = view.getUint32(offset, littleEndian);
    offset += 4;
    geomType = geomType & 0x0fffffff;
  }

  if (geomType === 1) {
    const x = view.getFloat64(offset, littleEndian);
    const y = view.getFloat64(offset + 8, littleEndian);
    return { type: "Point", coordinates: [x, y], crs: srid ? { type: "name", properties: { name: `EPSG:${srid}` } } : undefined };
  }

  if (geomType === 3) {
    const ringCount = view.getUint32(offset, littleEndian);
    offset += 4;
    const rings = [];
    for (let i = 0; i < ringCount; i++) {
      const pointCount = view.getUint32(offset, littleEndian);
      offset += 4;
      const ring = [];
      for (let j = 0; j < pointCount; j++) {
        const x = view.getFloat64(offset, littleEndian);
        const y = view.getFloat64(offset + 8, littleEndian);
        offset += 16;
        ring.push([x, y]);
      }
      rings.push(ring);
    }
    return { type: "Polygon", coordinates: rings, crs: srid ? { type: "name", properties: { name: `EPSG:${srid}` } } : undefined };
  }

  return null;
}

function rowToFeature(row, geomField = "geom") {
  if (!row) return null;
  const geomValue = row[geomField] ?? row.geom ?? row.geometry;
  if (!geomValue) return null;
  const geometry = parseWkbToGeoJSON(geomValue);
  if (!geometry) return null;
  const properties = { ...row };
  delete properties[geomField];
  delete properties.geom;
  delete properties.geometry;
  return {
    type: "Feature",
    geometry,
    properties,
  };
}

function getFeatureLabel(feature) {
  const p = feature.properties || {};
  const candidates = [
    p.navn,
    p.Navn,
    p.name,
    p.Name,
    p.navn_skole,
    p.skole_navn,
    p.skole,
    p.navn_punkter,
    p.tittel,
  ];
  const label = candidates.find(v => typeof v === "string" && v.trim().length > 0);
  if (label) return label;

  for (const key of Object.keys(p)) {
    const value = p[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return "Ukjent";
}

function parseFeatureCollection(data) {
  const fc = Array.isArray(data)
    ? (Object.values(data[0] || {}).find(v => typeof v === "object") || data[0])
    : data;
  return Array.isArray(fc?.features) ? fc.features : [];
}

function normalizeBefolkningResult(data) {
  if (!data) return null;
  return Array.isArray(data) ? data[0] : data;
}

function getTotalBefolkning(data) {
  const payload = normalizeBefolkningResult(data);
  if (!payload) return null;
  const value = payload.total_befolkning ?? payload.total_bef ?? payload.befolkning;
  return value == null ? null : safeNumber(value);
}

async function fetchShelterFeaturesWithinRadius(lat, lng, radius) {
  if (!window.supabaseClient) return [];
  try {
    const { data, error } = await window.supabaseClient.rpc("get_shelters_within", {
      lat_in: lat,
      lon_in: lng,
      radius_m_in: radius
    });
    if (error) {
      console.warn("Hent shelters innen radius feil:", error);
      return [];
    }
    return parseFeatureCollection(data);
  } catch (e) {
    console.warn("Hent shelters innen radius feil:", e);
    return [];
  }
}

async function getShelterFeaturesInsidePolygon(latlngs) {
  if (!Array.isArray(latlngs) || !latlngs.length) return [];

  const center = calculateCentroid(latlngs);
  const features = await fetchShelterFeaturesWithinRadius(center.lat, center.lng, 50000); // Stor radius for å få alle mulige

  return features.filter(feature => {
    const geometry = feature?.geometry;
    if (!geometry || geometry.type !== "Point") return false;
    const rawCoords = geometry.coordinates;
    const coords = Array.isArray(rawCoords[0]) ? rawCoords[0] : rawCoords;
    if (!Array.isArray(coords) || coords.length < 2) return false;
    return pointInPolygon({ lat: Number(coords[1]), lng: Number(coords[0]) }, latlngs);
  });
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function estimatePolygonRadius(latlngs) {
  if (!Array.isArray(latlngs) || !latlngs.length) return crisisRadius || 1000;
  const center = crisisCenter || calculateCentroid(latlngs);
  let maxDist = 0;
  latlngs.forEach((latlng) => {
    const d = haversineDistance(center.lat, center.lng, latlng.lat, latlng.lng);
    if (d > maxDist) maxDist = d;
  });
  return Math.max(maxDist, crisisRadius || 100);
}

async function hentBefolkningForCrisisArea() {
  if (!crisisCenter) return null;
  if (crisisIsPolygon && drawnPolygon) {
    const polygonLatLngs = drawnPolygon.getLatLngs()[0];
    const searchRadius = Math.max(estimatePolygonRadius(polygonLatLngs), crisisRadius || 0);
    return await hentBefolkning(crisisCenter.lat, crisisCenter.lng, searchRadius);
  }
  return await hentBefolkning(crisisCenter.lat, crisisCenter.lng, crisisRadius);
}

function getShelterFeaturesFromLayer() {
  const geojson = tilfluktsromLayer.toGeoJSON();
  let features = Array.isArray(geojson?.features) ? geojson.features : [];
  if (!features.length) {
    const layers = tilfluktsromLayer.getLayers();
    if (Array.isArray(layers)) {
      features = layers
        .filter(layer => layer && layer.feature)
        .map(layer => layer.feature);
    }
  }
  return features;
}

function sumShelterFeatures(features) {
  let count = 0;
  let totalCapacity = 0;

  features.forEach(feature => {
    const plasser = safeNumber(feature.properties?.plasser);
    if (plasser > 0) {
      count += 1;
      totalCapacity += plasser;
    }
  });

  return { count, totalCapacity };
}

async function hentShelterCapacityFraServer(lat, lng, radiusM) {
  if (!window.supabaseClient) return { count: 0, totalCapacity: 0 };

  try {
    const { data, error } = await window.supabaseClient.rpc("get_shelters_within", {
      lat_in: lat,
      lon_in: lng,
      radius_m_in: radiusM
    });
    if (error) {
      console.warn("Shelter capacity feil:", error);
      return { count: 0, totalCapacity: 0 };
    }

    const features = parseFeatureCollection(data);
    return sumShelterFeatures(features);
  } catch (e) {
    console.warn("Shelter capacity feil:", e);
    return { count: 0, totalCapacity: 0 };
  }
}

async function calculateShelterCapacityInsideCrisis() {
  if (!crisisCenter) return { count: 0, totalCapacity: 0 };

  if (!crisisIsPolygon) {
    return await hentShelterCapacityFraServer(crisisCenter.lat, crisisCenter.lng, crisisRadius);
  }

  if (!drawnPolygon) {
    return { count: 0, totalCapacity: 0 };
  }

  const latlngs = drawnPolygon.getLatLngs()[0];
  const polygonRadius = estimatePolygonRadius(latlngs);
  const radius = Math.max(crisisRadius || 0, polygonRadius);
  return await hentShelterCapacityFraServer(crisisCenter.lat, crisisCenter.lng, Math.round(radius));
}
 
function calculateCentroid(latlngs) {
  let x = 0, y = 0, z = 0;
  latlngs.forEach(latlng => {
    const lat = latlng.lat * Math.PI / 180;
    const lng = latlng.lng * Math.PI / 180;
    x += Math.cos(lat) * Math.cos(lng);
    y += Math.cos(lat) * Math.sin(lng);
    z += Math.sin(lat);
  });
  const total = latlngs.length;
  x /= total; y /= total; z /= total;
  const lng = Math.atan2(y, x);
  const hyp = Math.sqrt(x * x + y * y);
  const lat = Math.atan2(z, hyp);
  return { lat: lat * 180 / Math.PI, lng: lng * 180 / Math.PI };
}
 
// =======================
// Slider UI
// =======================
slider.addEventListener("input", async () => {
  const newRadius = sliderToRadius(Number(slider.value));
  radiusValue.textContent = newRadius + " m";
  if (kriseCircle && !crisisIsPolygon) {
    kriseCircle.setRadius(newRadius);
  }
  crisisRadius = newRadius;

  if (crisisCenter) {
    const befolkning = crisisIsPolygon
      ? await hentBefolkningForCrisisArea()
      : await hentBefolkning(crisisCenter.lat, crisisCenter.lng, newRadius);
    const totalBef = getTotalBefolkning(befolkning);
    const befEl = document.getElementById("bef-tall");
    const kapEl = document.getElementById("bef-kapasitet");
    const shelterCountEl = document.getElementById("shelter-count");
    const shelterCapacityEl = document.getElementById("shelter-capacity");
    const crisisShelters = await calculateShelterCapacityInsideCrisis();
    const plasser = crisisShelters.totalCapacity;

    if (befEl && totalBef !== null) {
      befEl.textContent = `👥 ~${totalBef.toLocaleString("no")} personer`;
    }
    if (shelterCountEl) {
      shelterCountEl.textContent = `${crisisShelters.count} tilfluktsrom i området`;
    }
    if (shelterCapacityEl) {
      shelterCapacityEl.textContent = plasser
        ? `👥 ${plasser.toLocaleString("no")} plasser total` : `👥 Ingen registrerte plasser i området`;
    }
    if (kapEl && totalBef !== null) {
      kapEl.textContent = plasser && totalBef > plasser
        ? `⚠️ Kapasitet for lav! ${totalBef.toLocaleString("no")} pers. vs ${plasser.toLocaleString("no")} plasser på ${crisisShelters.count} rom`
        : plasser ? `✅ Tilstrekkelig kapasitet` : "Ingen tilfluktsrom funnet i området";
    }
  }
});
 
// =======================
// Tilfluktsrom-lag
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
    layer.bindPopup(`
      <strong>🛡️ Tilfluktsrom</strong><br>
      <b>Adresse:</b> ${p.adresse || "Ukjent adresse"}<br>
      ${p.romnr ? `<b>Rom nr:</b> ${p.romnr}` : ""}
    `);
  }
}).addTo(map);

const videregaendeSkolerLayer = L.geoJSON(null, {
  pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
    radius: 8,
    color: "#f39c12",
    fillColor: "#f1c40f",
    fillOpacity: 0.8,
    weight: 2,
  }),
  onEachFeature: (feature, layer) => {
    const p = feature.properties || {};
    layer.bindPopup(`
      <strong>🏫 Videregående skole</strong><br>
      <b>Navn:</b> ${getFeatureLabel(feature)}<br>
      ${p.adresse ? `<b>Adresse:</b> ${p.adresse}<br>` : ""}
    `);
  }
}).addTo(map);

const grunnskolerLayer = L.geoJSON(null, {
  pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
    radius: 6,
    color: "#27ae60",
    fillColor: "#2ecc71",
    fillOpacity: 0.8,
    weight: 2,
  }),
  onEachFeature: (feature, layer) => {
    const p = feature.properties || {};
    layer.bindPopup(`
      <strong>🏫 Grunnskole</strong><br>
      <b>Navn:</b> ${getFeatureLabel(feature)}<br>
      ${p.adresse ? `<b>Adresse:</b> ${p.adresse}<br>` : ""}
    `);
  }
}).addTo(map);
 
async function lastAlleTilfluktsrom() {
  if (!window.supabaseClient) return;
  try {
    const { data, error } = await window.supabaseClient.rpc("get_shelters_within", {
      lat_in: 58.3, lon_in: 7.8, radius_m_in: 200000
    });
    if (error) { console.error("Tilfluktsrom feil:", error); return; }
    const fc = Array.isArray(data)
      ? (Object.values(data[0] || {}).find(v => typeof v === "object") || data[0])
      : data;
    if (fc && fc.type === "FeatureCollection") {
      tilfluktsromLayer.addData(fc);
    }
  } catch (e) {
    console.error("Klarte ikke laste tilfluktsrom:", e);
  }
}

async function fetchTableFeatures(tableName, layer, label) {
  if (!window.supabaseClient) return;
  try {
    const { data, error } = await window.supabaseClient.from(tableName).select("*");
    if (error) {
      console.error(`Feil ved henting av ${label}:`, error);
      return;
    }
    if (!Array.isArray(data)) {
      console.warn(`Uventet svar fra ${label}:`, data);
      return;
    }

    const features = data.map(row => rowToFeature(row, "geom")).filter(Boolean);
    console.info(`Hentet ${data.length} rader fra ${label}, opprettet ${features.length} features`);
    if (features.length) {
      layer.addData({ type: "FeatureCollection", features });
    }
  } catch (e) {
    console.error(`Klarte ikke laste ${label}:`, e);
  }
}

async function lastVideregaendeSkoler() {
  await fetchTableFeatures("videregaende_skoler", videregaendeSkolerLayer, "videregående skoler");
}

async function lastGrunnskoler() {
  await fetchTableFeatures("grunnskoler", grunnskolerLayer, "grunnskoler");
}
 
lastAlleTilfluktsrom();
lastVideregaendeSkoler();
lastGrunnskoler();
 
// =======================
// Hent befolkning i radius
// =======================
async function hentBefolkning(lat, lng, radiusM) {
  try {
    const { data, error } = await window.supabaseClient.rpc("get_befolkning_i_radius", {
      lat_in: lat,
      lon_in: lng,
      radius_m_in: radiusM
    });
    if (error) { console.warn("Befolkning feil:", error); return null; }
    return normalizeBefolkningResult(data);
  } catch (e) {
    console.warn("Befolkning feil:", e);
    return null;
  }
}
 
// =======================
// Finn nærmeste tilfluktsrom
// =======================
async function finnNærmesteTilfluktsrom(lat, lng) {
  const { data, error } = await window.supabaseClient.rpc("get_shelters_within", {
    lat_in: lat, lon_in: lng, radius_m_in: 50000
  });
  if (error) throw new Error("Supabase feil: " + error.message);
 
  const fc = Array.isArray(data)
    ? (Object.values(data[0] || {}).find(v => typeof v === "object") || data[0])
    : data;
 
  if (!fc || !fc.features?.length) return null;
 
  const sorted = fc.features
    .filter(f => f.properties?.distance_m != null)
    .sort((a, b) => a.properties.distance_m - b.properties.distance_m);
 
  if (!sorted.length) return null;
 
  const nærmeste = sorted[0];
  const rawCoords = nærmeste.geometry.coordinates;
  const coords = Array.isArray(rawCoords[0]) ? rawCoords[0] : rawCoords;
  const p = nærmeste.properties;
 
  return {
    lat: Number(coords[1]),
    lng: Number(coords[0]),
    adresse: p.adresse || "Ukjent adresse",
    plasser: p.plasser || null,
    romnr: p.romnr || null,
    distance_m: p.distance_m,
  };
}
 
async function finnNærmesteTilfluktsromUtenfor(lat, lng) {
  const { data, error } = await window.supabaseClient.rpc("get_shelters_within", {
    lat_in: lat, lon_in: lng, radius_m_in: 50000
  });
  if (error) throw new Error("Supabase feil: " + error.message);
 
  const fc = Array.isArray(data)
    ? (Object.values(data[0] || {}).find(v => typeof v === "object") || data[0])
    : data;
 
  if (!fc || !fc.features?.length) return null;
 
  const filtrert = fc.features.filter(f => {
    const rawCoords = f.geometry.coordinates;
    const coords = Array.isArray(rawCoords[0]) ? rawCoords[0] : rawCoords;
    const point = { lat: Number(coords[1]), lng: Number(coords[0]) };
    return !isPointInsideCrisis(point);
  });
 
  if (!filtrert.length) return null;
 
  filtrert.sort((a, b) => a.properties.distance_m - b.properties.distance_m);
 
  const nærmeste = filtrert[0];
  const rawCoords = nærmeste.geometry.coordinates;
  const coords = Array.isArray(rawCoords[0]) ? rawCoords[0] : rawCoords;
  const p = nærmeste.properties;
 
  return {
    lat: Number(coords[1]),
    lng: Number(coords[0]),
    adresse: p.adresse || "Ukjent adresse",
    plasser: p.plasser || null,
    romnr: p.romnr || null,
    distance_m: p.distance_m,
  };
}
 
// =======================
// ORS vegbasert rute
// =======================
async function hentOrsRute(fraLat, fraLng, tilLat, tilLng) {
  const fLat = parseFloat(Number(fraLat).toFixed(6));
  const fLng = parseFloat(Number(fraLng).toFixed(6));
  const tLat = parseFloat(Number(tilLat).toFixed(6));
  const tLng = parseFloat(Number(tilLng).toFixed(6));
 
  const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": ORS_API_KEY,
    },
    body: JSON.stringify({
      coordinates: [[fLng, fLat], [tLng, tLat]]
    })
  });
 
  if (!res.ok) {
    const err = await res.text();
    throw new Error("ORS feil: " + err);
  }
 
  const json = await res.json();
  const feature = json.features?.[0];
  if (!feature) throw new Error("Ingen rute fra ORS.");
 
  return {
    geojson: feature.geometry,
    distance: feature.properties.summary.distance,
    duration: feature.properties.summary.duration,
  };
}
 
// =======================
// Evakueringsrute fra valgt punkt
// =======================
async function handleEvacRoute(lat, lng) {
  if (!window.supabaseClient) return;
 
  if (!crisisCenter && !drawnPolygon) {
    showInfoPanel(`<b>⚠️ Ingen kriseområde definert.</b><br>Definer først et kriseområde.`);
    return;
  }
 
  const point = { lat, lng };
  if (!isPointInsideCrisis(point)) {
    showInfoPanel(`<b>⚠️ Punktet må være inne i kriseområdet.</b><br>Velg et nytt punkt inne i det markerte området.`);
    return;
  }
 
  if (evacStartMarker) { map.removeLayer(evacStartMarker); evacStartMarker = null; }
  if (evacRouteLayer) { map.removeLayer(evacRouteLayer); evacRouteLayer = null; }
  if (evacDestMarker) { map.removeLayer(evacDestMarker); evacDestMarker = null; }
 
  evacStartMarker = L.circleMarker([lat, lng], {
    radius: 6, color: "#16a085", fillColor: "#16a085", fillOpacity: 1, weight: 2,
  }).addTo(map);
 
  showInfoPanel(`<b>🧭 Evakueringsrute</b><br>🔍 Søker...`);
 
  try {
    const shelter = await finnNærmesteTilfluktsromUtenfor(lat, lng);
 
    if (!shelter) {
      showInfoPanel(`<b>🧭 Evakueringsrute</b><br>⚠️ Fant ingen tilfluktsrom utenfor kriseområdet innenfor 50 km.`);
      return;
    }
 
    const rute = await hentOrsRute(lat, lng, shelter.lat, shelter.lng);
 
    evacRouteLayer = L.geoJSON(rute.geojson, {
      style: { color: "#16a085", weight: 5, opacity: 0.9 }
    }).addTo(map);
 
    evacDestMarker = L.marker([shelter.lat, shelter.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="
          background:#16a085;border:3px solid white;border-radius:3px;
          width:18px;height:18px;box-shadow:0 2px 8px rgba(0,0,0,0.6);
        "></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      })
    }).addTo(map)
      .bindPopup(`
        <strong>🧭 Evakueringsrute – tilfluktsrom</strong><br>
        <b>Adresse:</b> ${shelter.adresse}<br>
        ${shelter.romnr ? `<b>Rom nr:</b> ${shelter.romnr}<br>` : ""}
        ${shelter.plasser ? `<b>Plasser:</b> ${shelter.plasser}` : ""}
      `);
 
    showInfoPanel(`
      <b>🧭 Evakueringsrute fra valgt punkt</b><br>
      📏 ${formatDistance(rute.distance)}<br>
      ⏱️ ${formatDuration(rute.duration)}<br><br>
      <div class="shelter-item">
        <b>Tilfluktsrom:</b><br>
        🏠 ${shelter.adresse}<br>
        ${shelter.plasser ? `👥 ${shelter.plasser} plasser<br>` : ""}
      </div>
    `);
 
    const bounds = evacRouteLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
 
  } catch (e) {
    console.error(e);
    showInfoPanel(`<b>🧭 Evakueringsrute</b><br>❌ Feil: ${e.message}`);
  }
}
 
// =======================
// Hovedfunksjon: håndter kriseområde
// =======================
async function handleCrisisPoint(lat, lng, options = {}) {
  const usePolygon = options.usePolygon || false;
  const radius = sliderToRadius(Number(slider.value));
 
  if (kriseMarker) map.removeLayer(kriseMarker);
  if (kriseCircle) map.removeLayer(kriseCircle);
  if (destinasjonMarker) map.removeLayer(destinasjonMarker);
  if (ruteLayer) map.removeLayer(ruteLayer);
  if (luftlinjeLag) map.removeLayer(luftlinjeLag);
 
  crisisCenter = { lat, lng };
  crisisRadius = radius;
  crisisIsPolygon = usePolygon;
 
  if (!usePolygon) {
    kriseCircle = L.circle([lat, lng], {
      radius: radius,
      color: "#e74c3c",
      fillColor: "#e74c3c",
      fillOpacity: 0.15,
      weight: 2,
    }).addTo(map);
  }
 
  kriseMarker = L.circleMarker([lat, lng], {
    radius: 6, color: "#e74c3c", fillColor: "#e74c3c", fillOpacity: 1, weight: 2,
  }).addTo(map);
 
  showInfoPanel(`<b>🔍 Søker etter nærmeste tilfluktsrom...</b>`);
 
  try {
    // Hent tilfluktsrom og befolkning parallelt
    const [shelter, befolkning] = await Promise.all([
      finnNærmesteTilfluktsrom(lat, lng),
      crisisIsPolygon ? hentBefolkningForCrisisArea() : hentBefolkning(lat, lng, radius)
    ]);
 
    if (!shelter) {
      showInfoPanel(`<b>🚨 Kriseområde markert</b><br><br>⚠️ Ingen tilfluktsrom funnet innenfor 50 km.`);
      return;
    }
 
    showInfoPanel(`<b>🗺️ Beregner rute...</b>`);
 
    luftlinjeLag = L.polyline([[lat, lng], [shelter.lat, shelter.lng]], {
      color: "#e74c3c", weight: 2, opacity: 0.5, dashArray: "6, 8",
    }).addTo(map);
 
    let ruteInfo = null;
    try {
      const rute = await hentOrsRute(lat, lng, shelter.lat, shelter.lng);
      ruteLayer = L.geoJSON(rute.geojson, {
        style: { color: "#e74c3c", weight: 5, opacity: 0.85 }
      }).addTo(map);
      ruteInfo = { distance: rute.distance, duration: rute.duration, type: "vegbasert" };
    } catch {
      ruteInfo = { type: "luftlinje" };
    }
 
    destinasjonMarker = L.marker([shelter.lat, shelter.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="
          background:#1a73e8;border:3px solid white;border-radius:3px;
          width:18px;height:18px;box-shadow:0 2px 8px rgba(0,0,0,0.6);
        "></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      })
    }).addTo(map)
      .bindPopup(`
        <strong>🛡️ Nærmeste tilfluktsrom</strong><br>
        <b>Adresse:</b> ${shelter.adresse}<br>
        ${shelter.romnr ? `<b>Rom nr:</b> ${shelter.romnr}<br>` : ""}
        ${shelter.plasser ? `<b>Plasser:</b> ${shelter.plasser}` : ""}
      `)
      .openPopup();
 
    const ruteHtml = ruteInfo.type === "vegbasert"
      ? `<b>Kjørerute fra sentrum:</b><br>
         📏 ${formatDistance(ruteInfo.distance)}<br>
         ⏱️ ${formatDuration(ruteInfo.duration)}`
      : `⚠️ Vegbasert rute ikke tilgjengelig<br><small style="color:#aaa">Viser luftlinje</small>`;
 
    // Befolkningsinfo
    const totalBef = getTotalBefolkning(befolkning);
    const crisisShelterCapacity = await calculateShelterCapacityInsideCrisis();
    const totalPlasser = crisisShelterCapacity.totalCapacity;
    let befolkningHtml = "";
 
    if (totalBef !== null) {
      const kapasitetWarning = totalPlasser && totalBef > totalPlasser
        ? `<br>⚠️ <b style="color:#e74c3c">Kapasitet for lav!</b> ${totalBef.toLocaleString("no")} pers. vs ${totalPlasser.toLocaleString("no")} plasser på ${crisisShelterCapacity.count} rom`
        : totalPlasser
          ? `<br>✅ Tilstrekkelig kapasitet`
          : "<br>⚠️ Ingen tilfluktsrom funnet i området";
 
      befolkningHtml = `
        <div class="route-item" style="border-left-color:#f39c12">
          <b>Befolkning i kriseområdet:</b><br>
          <span id="bef-tall">👥 ~${totalBef.toLocaleString("no")} personer</span><br>
          <span id="shelter-count">${crisisShelterCapacity.count} tilfluktsrom i området</span><br>
          <span id="shelter-capacity">${totalPlasser ? `👥 ${totalPlasser.toLocaleString("no")} plasser total` : "👥 Ingen registrerte plasser"}</span>
          <span id="bef-kapasitet" style="display:block">${kapasitetWarning.replace("<br>", "")}</span>
        </div>`;
    }
 
    showInfoPanel(`
      <b>🚨 Kriseområde markert</b><br>
      <small style="color:#aaa">${lat.toFixed(4)}, ${lng.toFixed(4)}</small><br><br>
      ${befolkningHtml}
      <div class="shelter-item">
        <b>Nærmeste tilfluktsrom:</b><br>
        🏠 ${shelter.adresse}<br>
        ${shelter.plasser ? `👥 ${shelter.plasser} plasser<br>` : ""}
        📍 ${formatDistance(shelter.distance_m)} luftlinje
      </div>
      <div class="route-item">
        ${ruteHtml}
      </div>
      <small style="color:#aaa">
        For evakueringsrute fra et annet sted i kriseområdet:<br>
        trykk "Evakueringsrute fra valgt punkt" og klikk i området.
      </small>
    `);
 
    const bounds = ruteLayer ? ruteLayer.getBounds() : luftlinjeLag.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
 
  } catch (err) {
    console.error(err);
    showInfoPanel("❌ Feil: " + err.message);
  }
}
 
// =======================
// Klikk på kartet
// =======================
map.on("click", (e) => {
  if (polygonMode) return;
  const { lat, lng } = e.latlng;
  if (evacSelectMode) {
    evacSelectMode = false;
    handleEvacRoute(lat, lng);
    return;
  }
  handleCrisisPoint(lat, lng, { usePolygon: false });
});
 
// =======================
// Polygon-tegning
// =======================
document.getElementById("draw-polygon-btn").addEventListener("click", () => {
  polygonMode = true;
  evacSelectMode = false;
  polygonDrawer = new L.Draw.Polygon(map);
  polygonDrawer.enable();
});
 
map.on(L.Draw.Event.CREATED, function (e) {
  polygonMode = false;
  if (drawnPolygon) map.removeLayer(drawnPolygon);
  drawnPolygon = e.layer;
  map.addLayer(drawnPolygon);
  const latlngs = drawnPolygon.getLatLngs()[0];
  const centroid = calculateCentroid(latlngs);
  handleCrisisPoint(centroid.lat, centroid.lng, { usePolygon: true });
});
 
// =======================
// Evakueringsknapp
// =======================
document.getElementById("evac-btn").addEventListener("click", () => {
  if (!crisisCenter && !drawnPolygon) {
    showInfoPanel(`<b>⚠️ Ingen kriseområde definert.</b><br>Definer først et kriseområde ved å klikke eller tegne.`);
    return;
  }
  evacSelectMode = true;
  showInfoPanel(`<b>🧭 Evakueringsrute</b><br>Klikk et punkt <b>inne i kriseområdet</b> for å beregne rute til nærmeste tilfluktsrom utenfor.`);
});
 
// =======================
// Nullstill
// =======================
document.getElementById("reset-btn").addEventListener("click", () => {
  if (kriseMarker) { map.removeLayer(kriseMarker); kriseMarker = null; }
  if (kriseCircle) { map.removeLayer(kriseCircle); kriseCircle = null; }
  if (destinasjonMarker) { map.removeLayer(destinasjonMarker); destinasjonMarker = null; }
  if (ruteLayer) { map.removeLayer(ruteLayer); ruteLayer = null; }
  if (luftlinjeLag) { map.removeLayer(luftlinjeLag); luftlinjeLag = null; }
  if (drawnPolygon) { map.removeLayer(drawnPolygon); drawnPolygon = null; }
  if (evacStartMarker) { map.removeLayer(evacStartMarker); evacStartMarker = null; }
  if (evacRouteLayer) { map.removeLayer(evacRouteLayer); evacRouteLayer = null; }
  if (evacDestMarker) { map.removeLayer(evacDestMarker); evacDestMarker = null; }
 
  crisisCenter = null;
  crisisRadius = null;
  crisisIsPolygon = false;
  evacSelectMode = false;
 
  hideInfoPanel();
  map.setView([58.2, 8.0], 10);
});
 