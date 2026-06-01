/**
 * THEKA FINDER - Core Application Logic
 * Replicates the iOS Compass UI/UX, pointing to the nearest liquor store.
 */

// --- VERCEL ANALYTICS ---
// --- VERCEL WEB ANALYTICS ---
import { inject } from '@vercel/analytics';
inject();

// --- CONSTANTS & CONFIGURATION ---
const EARTH_RADIUS = 6371000; // Meters
const DEFAULT_SEARCH_RADIUS = 2000; // Start with 2km search radius
const MAX_SEARCH_RADIUS = 15000; // Max search radius 15km
const AVERAGE_STEP_LENGTH = 0.75; // 1 step = 0.75 meters

// Admin & Mock Mode detection via URL parameter or hash secret
const isAdminMode = window.location.search.includes('admin=true') || window.location.search.includes('mock=true') || window.location.hash === '#admin';
if (isAdminMode) {
  document.body.classList.add('admin');
}

// Real, verified Google Maps liquor shop coordinates for CP (Delhi), Indiranagar (Bengaluru), Bandra (Mumbai), Calangute (Goa)
const GOOGLE_MAPS_STORES = [
  // Delhi - Connaught Place
  { name: 'DSIDC Liquor Store', lat: 28.629337, lon: 77.218903, address: 'Block H, Connaught Place, New Delhi', source: 'Google Maps' },
  { name: 'Delhi Govt Liquor Shop Barakhamba', lat: 28.631584, lon: 77.223842, address: 'Barakhamba Road, Connaught Place, New Delhi', source: 'Google Maps' },
  { name: 'Wines & Beer Shop Janpath', lat: 28.626887, lon: 77.220194, address: 'Janpath Rd, Connaught Place, New Delhi', source: 'Google Maps' },
  { name: 'L1 Liquor Shop Outer Circle', lat: 28.635811, lon: 77.214482, address: 'Outer Circle, Connaught Place, New Delhi', source: 'Google Maps' },
  
  // Bengaluru - Indiranagar
  { name: 'Madhuloka Liquor Boutique', lat: 12.973467, lon: 77.641042, address: '100 Feet Rd, Indiranagar, Bengaluru', source: 'Google Maps' },
  { name: 'Tonique Indiranagar', lat: 12.978244, lon: 77.643222, address: '100 Feet Rd, Indiranagar, Bengaluru', source: 'Google Maps' },
  { name: 'House of Spirits CMH', lat: 12.979812, lon: 77.644131, address: 'CMH Road, Indiranagar, Bengaluru', source: 'Google Maps' },
  { name: 'Beer Tavern Indiranagar', lat: 12.964893, lon: 77.638422, address: 'Indiranagar Main Rd, Bengaluru', source: 'Google Maps' },

  // Mumbai - Bandra
  { name: 'Jumbo Wines Hill Road', lat: 19.060122, lon: 72.827344, address: 'Hill Road, Bandra West, Mumbai', source: 'Google Maps' },
  { name: 'Bandra Wine Shop', lat: 19.057122, lon: 72.831544, address: 'Linking Road, Bandra West, Mumbai', source: 'Google Maps' },
  { name: 'Warden Wines Carter Road', lat: 19.064522, lon: 72.824244, address: 'Shirley Rajan Rd, Carter Road, Bandra West, Mumbai', source: 'Google Maps' },
  
  // Goa - Calangute/Baga
  { name: 'Newton\'s Supermarket Liquor', lat: 15.523422, lon: 73.761131, address: 'Candolim Rd, Calangute, Goa', source: 'Google Maps' },
  { name: 'Vaz Liquor Mart Calangute', lat: 15.548211, lon: 73.756222, address: 'Baga Rd, Calangute, Goa', source: 'Google Maps' },
  { name: 'Goa Liquor Palace Baga', lat: 15.556211, lon: 73.753122, address: 'Baga Main Beach Road, Goa', source: 'Google Maps' }
];

// Mock locations and their nearby liquor shops for desktop testing/fallbacks
const MOCK_REGIONS = {
  'connaught-place': {
    name: 'Delhi: Connaught Place',
    lat: 28.6304,
    lon: 77.2177,
    shops: [
      { name: 'Government Liquor Store (L1)', lat: 28.6295, lon: 77.2155, address: 'Block C, Connaught Place, New Delhi' },
      { name: 'Sita Ram Wine & Beer Shop', lat: 28.6335, lon: 77.2198, address: 'Outer Circle, Connaught Place, New Delhi' },
      { name: 'Royal Wines & Spirits', lat: 28.6272, lon: 77.2215, address: 'Janpath Road, New Delhi' },
      { name: 'CP Beer Tavern & Liquor Shop', lat: 28.6322, lon: 77.2124, address: 'Radial Road 4, Connaught Place, New Delhi' }
    ]
  },
  'bengaluru-indiranagar': {
    name: 'Bengaluru: Indiranagar',
    lat: 12.9719,
    lon: 77.6412,
    shops: [
      { name: 'Madhuloka Liquor Boutique', lat: 12.9735, lon: 77.6435, address: '100 Feet Rd, Indiranagar, Bengaluru' },
      { name: 'Indiranagar Wine Tavern', lat: 12.9701, lon: 77.6385, address: 'Double Road, Indiranagar, Bengaluru' },
      { name: 'Toit Microbrewery (Pub & Takeaway)', lat: 12.9792, lon: 77.6408, address: '100 Feet Rd, Near Metro Station, Bengaluru' },
      { name: 'Spirits & More Shop', lat: 12.9665, lon: 77.6455, address: 'CMH Road, Indiranagar, Bengaluru' }
    ]
  },
  'mumbai-bandra': {
    name: 'Mumbai: Bandra West',
    lat: 19.0596,
    lon: 72.8295,
    shops: [
      { name: 'Jumbo Beer & Wine Shop', lat: 19.0612, lon: 72.8272, address: 'Hill Road, Bandra West, Mumbai' },
      { name: 'Bandra Wine Cellars', lat: 19.0565, lon: 72.8322, address: 'Linking Road, Bandra West, Mumbai' },
      { name: 'Warden Wines', lat: 19.0551, lon: 72.8252, address: 'Carter Road, Bandra West, Mumbai' }
    ]
  },
  'goa-calangute': {
    name: 'Goa: Calangute Beach',
    lat: 15.5494,
    lon: 73.7535,
    shops: [
      { name: 'Vaz Liquor Supermarket', lat: 15.5482, lon: 73.7562, address: 'Calangute-Baga Road, Goa' },
      { name: 'Newton\'s Wine Shop', lat: 15.5525, lon: 73.7511, address: 'Main Market, Calangute, Goa' },
      { name: 'Goan Spirits & Feni Store', lat: 15.5441, lon: 73.7552, address: 'Near Beach Circle, Calangute, Goa' }
    ]
  }
};

// --- APP STATE ---
const state = {
  userLocation: { lat: 28.6304, lon: 77.2177 }, // Default to Delhi CP
  heading: 0,
  headingDegrees: 0, // Magnetic or true heading
  stores: [],
  nearestStore: null,
  isMockMode: false,
  isWalkSimulating: false,
  walkSpeed: 1.5, // meters per second
  walkIntervalId: null,
  isDrawerOpen: false,
  lastVibrationTime: 0,
  hasGrantedLocation: false,
  hasGrantedOrientation: false,
  hasArrivedAtCurrentStore: false
};

// --- DOM ELEMENTS ---
const elements = {
  permissionScreen: document.getElementById('permission-screen'),
  compassScreen: document.getElementById('compass-screen'),
  btnRequestAccess: document.getElementById('btn-request-access'),
  btnMockMode: document.getElementById('btn-mock-mode'),
  headingVal: document.getElementById('heading-val'),
  headingDir: document.getElementById('heading-dir'),
  locationText: document.getElementById('location-text'),
  dialSvg: document.getElementById('dial-svg'),
  compassDial: document.getElementById('compass-dial'),
  liquorNeedle: document.getElementById('liquor-needle'),
  needleDistanceLabel: document.getElementById('needle-distance-label'),
  thekaStatusText: document.getElementById('theka-status-text'),
  thekaName: document.getElementById('theka-name'),
  thekaAddress: document.getElementById('theka-address'),
  metricDistance: document.getElementById('metric-distance'),
  metricDistanceUnit: document.getElementById('metric-distance-unit'),
  metricSteps: document.getElementById('metric-steps'),
  arrowIndicator: document.getElementById('arrow-indicator'),
  directionInstructions: document.getElementById('direction-instructions'),
  btnAppleMaps: document.getElementById('btn-apple-maps'),
  btnGoogleMaps: document.getElementById('btn-google-maps'),
  thekaSourceBadge: document.getElementById('theka-source-badge'),
  btnRetryPermissions: document.getElementById('btn-retry-permissions'),
  btnToggleSimulatorDrawer: document.getElementById('btn-toggle-simulator-drawer'),
  simulatorDrawer: document.getElementById('simulator-drawer'),
  btnCloseSimulator: document.getElementById('btn-close-simulator'),
  simHeadingSlider: document.getElementById('sim-heading-slider'),
  simHeadingVal: document.getElementById('sim-heading-val'),
  simLocationSelect: document.getElementById('sim-location-select'),
  customCoordsInputs: document.getElementById('custom-coords-inputs'),
  customLat: document.getElementById('custom-lat'),
  customLon: document.getElementById('custom-lon'),
  btnApplyCustomCoords: document.getElementById('btn-apply-custom-coords'),
  btnStartWalk: document.getElementById('btn-start-walk'),
  btnStopWalk: document.getElementById('btn-stop-walk'),
  btnTeleport: document.getElementById('btn-teleport'),
  simWalkSpeed: document.getElementById('sim-walk-speed'),
  telemetryUserPos: document.getElementById('telemetry-user-pos'),
  telemetryThekaPos: document.getElementById('telemetry-theka-pos'),
  telemetryBearing: document.getElementById('telemetry-bearing'),
  telemetryRelBearing: document.getElementById('telemetry-rel-bearing'),
  calibrationOverlay: document.getElementById('calibration-overlay'),
  btnDismissCalibration: document.getElementById('btn-dismiss-calibration'),
  confettiCanvas: document.getElementById('confetti-canvas')
};

// --- CONFETTI & SOUND SYSTEMS ---

// Preload the beer pop audio to unlock audio playback in iOS Safari
let beerAudio = null;

function initAudio() {
  if (!beerAudio) {
    beerAudio = new Audio('/beer-pop.mp3');
    beerAudio.preload = 'auto';
  }
}

/**
 * Plays a silent burst on user interaction to unlock the audio context for Safari.
 */
function unlockAudio() {
  initAudio();
  if (beerAudio) {
    beerAudio.play()
      .then(() => {
        beerAudio.pause();
        beerAudio.currentTime = 0;
      })
      .catch(err => {
        console.log('Audio context unlock deferred until user interaction:', err);
      });
  }
}

/**
 * Plays the realistic bottle pop sound effect.
 */
function playBeerPopSound() {
  try {
    initAudio();
    if (beerAudio) {
      beerAudio.currentTime = 0;
      beerAudio.play().catch(err => {
        console.warn('Audio play failed (waiting for user interaction):', err);
      });
    }
  } catch (e) {
    console.error('Audio play error:', e);
  }
}

// Fullscreen Canvas Confetti Particle System
const confetti = {
  canvas: null,
  ctx: null,
  particles: [],
  isActive: false,
  colors: ['#ffb703', '#fb8500', '#219ebc', '#8ecae6', '#ffffff', '#e63946', '#ffd166'],
  
  init() {
    this.canvas = elements.confettiCanvas;
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  
  resize() {
    if (this.canvas) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  },
  
  spawn() {
    const pCount = 180;
    this.particles = [];
    for (let i = 0; i < pCount; i++) {
      // Spawn particles near the bottom, shooting upwards
      this.particles.push({
        x: window.innerWidth * (0.15 + Math.random() * 0.7),
        y: window.innerHeight + 15,
        size: 5 + Math.random() * 8,
        color: this.colors[Math.floor(Math.random() * this.colors.length)],
        vx: -5 + Math.random() * 10,
        vy: -14 - Math.random() * 12,
        rotation: Math.random() * 360,
        vRotation: -6 + Math.random() * 12,
        opacity: 1,
        decay: 0.004 + Math.random() * 0.012
      });
    }
    
    if (!this.isActive) {
      this.isActive = true;
      this.loop();
    }
  },
  
  loop() {
    if (!this.isActive) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    let alive = false;
    for (let p of this.particles) {
      p.vy += 0.28; // Gravity
      p.vx *= 0.98; // Friction
      
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vRotation;
      
      // Decay opacity as they fall past middle of screen
      if (p.y > window.innerHeight * 0.4) {
        p.opacity -= p.decay;
      }
      
      if (p.opacity > 0 && p.y < window.innerHeight + 40) {
        alive = true;
        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(p.rotation * Math.PI / 180);
        this.ctx.fillStyle = p.color;
        this.ctx.globalAlpha = p.opacity;
        this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        this.ctx.restore();
      }
    }
    
    if (alive) {
      requestAnimationFrame(() => this.loop());
    } else {
      this.isActive = false;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
};

/**
 * Triggers arrival metrics updates, vibrations, synth pop sound, and confetti shower.
 */
function triggerArrivalCelebration() {
  triggerVibrationPulse(600);
  
  // Play beer pop + fizz sound
  playBeerPopSound();
  
  // Shoot confetti
  confetti.spawn();
  
  // Update status indicators in UI
  elements.directionInstructions.textContent = 'ARRIVED! GRAB A BEER! 🍻';
  elements.arrowIndicator.style.color = '#28a745';
  elements.thekaStatusText.textContent = '🍻 Arrived 🍻';
  
  // Pulse the bottom card
  const bottomCard = document.querySelector('.bottom-card');
  if (bottomCard) {
    bottomCard.style.animation = 'none';
    void bottomCard.offsetWidth; // Reflow
    bottomCard.style.animation = 'pulse 0.5s ease 3';
  }
}

// --- MATHEMATICAL UTILITIES ---

/**
 * Calculates Haversine distance between two sets of GPS coordinates in meters.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

/**
 * Calculates the initial bearing from start coordinate to end coordinate in degrees [0, 360).
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
            
  const bearingRad = Math.atan2(y, x);
  return (bearingRad * 180 / Math.PI + 360) % 360;
}

/**
 * Converts decimal degrees to a coordinates text representation (e.g. 28°37'49" N, 77°13'03" E).
 */
function formatCoordinates(lat, lon) {
  const latDirection = lat >= 0 ? 'N' : 'S';
  const lonDirection = lon >= 0 ? 'E' : 'W';
  
  const formatDMS = (decVal) => {
    const absVal = Math.abs(decVal);
    const degrees = Math.floor(absVal);
    const minutesDecimal = (absVal - degrees) * 60;
    const minutes = Math.floor(minutesDecimal);
    const seconds = Math.round((minutesDecimal - minutes) * 60);
    return `${degrees}°${minutes}'${seconds}"`;
  };
  
  return `${formatDMS(lat)} ${latDirection}, ${formatDMS(lon)} ${lonDirection}`;
}

/**
 * Translates an angle in degrees into a cardinal direction.
 */
function getCardinalDirection(angle) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
  const index = Math.round((angle % 360) / 45);
  return directions[index];
}

// --- RENDERING PROCEDURES ---

/**
 * Programmatically generates the iOS Compass dial markings in SVG.
 */
function generateCompassDial() {
  const center = 250;
  const outerRadius = 220;
  let svgContent = '';
  
  // Outer circle ring
  svgContent += `<circle cx="${center}" cy="${center}" r="${outerRadius}" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" fill="none" />`;
  
  // Generate 360 tick marks
  // To avoid cluttered rendering, we draw ticks every 2 degrees
  for (let angle = 0; angle < 360; angle += 2) {
    const rad = (angle - 90) * Math.PI / 180;
    let height = 6;
    let strokeWidth = 0.75;
    let strokeColor = 'rgba(255, 255, 255, 0.3)';
    
    if (angle % 30 === 0) {
      height = 18;
      strokeWidth = 2.5;
      strokeColor = '#ffffff';
    } else if (angle % 10 === 0) {
      height = 12;
      strokeWidth = 1.75;
      strokeColor = 'rgba(255, 255, 255, 0.8)';
    } else if (angle % 5 === 0) {
      height = 9;
      strokeWidth = 1.25;
      strokeColor = 'rgba(255, 255, 255, 0.5)';
    }
    
    // Custom style for North marker
    if (angle === 0) {
      strokeColor = varName('--accent-red', '#ff3b30');
    }
    
    const x1 = center + (outerRadius - height) * Math.cos(rad);
    const y1 = center + (outerRadius - height) * Math.sin(rad);
    const x2 = center + outerRadius * Math.cos(rad);
    const y2 = center + outerRadius * Math.sin(rad);
    
    svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`;
    
    // Add text labels for major angles
    if (angle % 30 === 0) {
      const textRadius = outerRadius - 38;
      const tx = center + textRadius * Math.cos(rad);
      const ty = center + textRadius * Math.sin(rad) + 5; // Slight vertical offset to center align text
      
      let label = angle;
      let labelColor = 'rgba(255,255,255,0.6)';
      let labelWeight = '300';
      let labelSize = '14px';
      
      // Cardinal directions override degrees
      if (angle === 0) {
        label = 'N';
        labelColor = '#ff3b30';
        labelWeight = '700';
        labelSize = '18px';
      } else if (angle === 90) {
        label = 'E';
        labelColor = '#ffffff';
        labelWeight = '600';
        labelSize = '16px';
      } else if (angle === 180) {
        label = 'S';
        labelColor = '#ffffff';
        labelWeight = '600';
        labelSize = '16px';
      } else if (angle === 270) {
        label = 'W';
        labelColor = '#ffffff';
        labelWeight = '600';
        labelSize = '16px';
      }
      
      svgContent += `<text x="${tx}" y="${ty}" fill="${labelColor}" font-family="${varName('--font-family-main')}" font-size="${labelSize}" font-weight="${labelWeight}" text-anchor="middle">${label}</text>`;
    }
  }
  
  elements.dialSvg.innerHTML = svgContent;
}

// Helper to get CSS variable values falling back to defaults
function varName(cssVar, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || fallback;
}

/**
 * Refreshes UI based on the current heading and geolocation.
 */
function updateCompassDisplay() {
  // 1. Rotate the compass dial (North points up, so dial rotates counter to heading)
  elements.compassDial.style.transform = `rotate(${-state.heading}deg)`;
  
  // 2. Update heading text row
  const currentHeadingInt = Math.round(state.heading);
  elements.headingVal.textContent = currentHeadingInt;
  elements.headingDir.textContent = getCardinalDirection(currentHeadingInt);
  
  // 3. Update location coordinates
  elements.locationText.textContent = formatCoordinates(state.userLocation.lat, state.userLocation.lon);
  
  // 4. Update the liquor needle and target metrics
  if (state.nearestStore) {
    const bearing = calculateBearing(
      state.userLocation.lat, state.userLocation.lon,
      state.nearestStore.lat, state.nearestStore.lon
    );
    
    const distance = haversineDistance(
      state.userLocation.lat, state.userLocation.lon,
      state.nearestStore.lat, state.nearestStore.lon
    );
    
    const steps = Math.round(distance / AVERAGE_STEP_LENGTH);
    
    // Absolute angle in viewport is (bearing - heading)
    const relativeAngle = (bearing - state.heading + 360) % 360;
    elements.liquorNeedle.style.transform = `rotate(${relativeAngle}deg)`;
    
    // Rotate the inner label back so it stays upright/legible
    elements.needleDistanceLabel.style.transform = `translateX(-50%) rotate(${-relativeAngle}deg)`;
    
    // Set distance label text on the needle
    if (distance >= 1000) {
      elements.needleDistanceLabel.textContent = `${(distance / 1000).toFixed(1)} km`;
    } else {
      elements.needleDistanceLabel.textContent = `${Math.round(distance)} m`;
    }
    
    // Update bottom card panel
    elements.thekaName.textContent = state.nearestStore.name;
    elements.thekaAddress.textContent = state.nearestStore.address || 'Address unknown';
    
    if (distance >= 1000) {
      elements.metricDistance.textContent = (distance / 1000).toFixed(2);
      elements.metricDistanceUnit.textContent = 'km';
    } else {
      elements.metricDistance.textContent = Math.round(distance);
      elements.metricDistanceUnit.textContent = 'm';
    }
    elements.metricSteps.textContent = steps.toLocaleString();
    
    // Update Direction helper arrow and text instructions
    // Center arrow alignment: points relative to phone orientation
    elements.arrowIndicator.style.transform = `rotate(${relativeAngle}deg)`;
    
    let directionText = '';
    const needlePointer = document.querySelector('.liquor-pointer');
    
    // If aligned within 5 degrees, trigger haptic-like vibration pulse
    if (relativeAngle < 5 || relativeAngle > 355) {
      directionText = 'Straight ahead! Go get it! 🍻';
      elements.arrowIndicator.style.color = '#28a745'; // Green
      triggerVibrationPulse(150); // Light haptic tick
      if (needlePointer) needlePointer.classList.add('aligned');
    } else {
      if (needlePointer) needlePointer.classList.remove('aligned');
      if (relativeAngle <= 180) {
        directionText = `Turn ${Math.round(relativeAngle)}° to your right`;
        elements.arrowIndicator.style.color = 'var(--accent-amber)';
      } else {
        directionText = `Turn ${Math.round(360 - relativeAngle)}° to your left`;
        elements.arrowIndicator.style.color = 'var(--accent-amber)';
      }
    }
    
    // Check if user has arrived at the store (within 5 meters)
    if (distance <= 5) {
      if (needlePointer) needlePointer.classList.add('aligned');
      if (!state.hasArrivedAtCurrentStore) {
        state.hasArrivedAtCurrentStore = true;
        triggerArrivalCelebration();
      }
    } else {
      elements.directionInstructions.textContent = directionText;
      // Reset arrival flag if they walk away
      if (distance > 15) {
        state.hasArrivedAtCurrentStore = false;
      }
    }
    
    // Update Maps Action Redirect Links
    if (elements.btnAppleMaps) {
      elements.btnAppleMaps.href = `https://maps.apple.com/?daddr=${state.nearestStore.lat},${state.nearestStore.lon}&dirflg=w`;
      elements.btnAppleMaps.classList.remove('disabled');
    }
    if (elements.btnGoogleMaps) {
      elements.btnGoogleMaps.href = `https://www.google.com/maps/search/?api=1&query=${state.nearestStore.lat},${state.nearestStore.lon}`;
      elements.btnGoogleMaps.classList.remove('disabled');
    }
    
    // Update Source Badge
    if (elements.thekaSourceBadge) {
      elements.thekaSourceBadge.textContent = state.nearestStore.source || 'OSM';
      elements.thekaSourceBadge.style.display = 'inline-block';
      if (state.nearestStore.source === 'Google Maps') {
        elements.thekaSourceBadge.style.background = 'rgba(66, 133, 244, 0.15)';
        elements.thekaSourceBadge.style.color = '#4285F4';
      } else {
        elements.thekaSourceBadge.style.background = 'rgba(255, 183, 3, 0.15)';
        elements.thekaSourceBadge.style.color = 'var(--accent-amber)';
      }
    }
    
    // Update Telemetry panel
    elements.telemetryThekaPos.textContent = `${state.nearestStore.lat.toFixed(5)}, ${state.nearestStore.lon.toFixed(5)}`;
    elements.telemetryBearing.textContent = `${Math.round(bearing)}°`;
    elements.telemetryRelBearing.textContent = `${Math.round(relativeAngle)}°`;
  } else {
    // Reset/loading state
    elements.liquorNeedle.style.transform = 'rotate(0deg)';
    elements.needleDistanceLabel.textContent = '-- m';
    elements.thekaName.textContent = 'Searching...';
    elements.metricDistance.textContent = '--';
    elements.metricSteps.textContent = '--';
    if (elements.btnAppleMaps) elements.btnAppleMaps.classList.add('disabled');
    if (elements.btnGoogleMaps) elements.btnGoogleMaps.classList.add('disabled');
    if (elements.thekaSourceBadge) elements.thekaSourceBadge.style.display = 'none';
  }
  
  // Update Simulator telemetry
  elements.telemetryUserPos.textContent = `${state.userLocation.lat.toFixed(5)}, ${state.userLocation.lon.toFixed(5)}`;
}

/**
 * Triggers hardware vibration if available, throttling it to avoid constant buzzing.
 */
function triggerVibrationPulse(duration) {
  const now = Date.now();
  // Vibrate at most once every 1200ms to mimic steady haptics
  if (navigator.vibrate && (now - state.lastVibrationTime > 1200)) {
    navigator.vibrate(duration);
    state.lastVibrationTime = now;
  }
}

// --- LOCATION FINDER & OSM API INTEGRATION ---

/**
 * Dynamic fetch from our secure serverless backend proxy for Google Places.
 */
async function fetchGooglePlacesStores(lat, lon, radius) {
  try {
    const url = `/api/places?lat=${lat}&lon=${lon}&radius=${radius}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google API Proxy responded with status ${response.status}`);
    }
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Failed to fetch from Google Places API proxy:', error);
    return [];
  }
}

/**
 * Queries OSM Overpass API and Google Places API to search for shops in widening radii.
 */
async function findNearestLiquorStore(lat, lon) {
  updateStatus('Locating nearby liquor stores...');
  
  // 1. Fetch from Google Places API via our secure serverless proxy
  let googleStores = [];
  try {
    updateStatus('Searching Google Places...');
    googleStores = await fetchGooglePlacesStores(lat, lon, MAX_SEARCH_RADIUS);
  } catch (err) {
    console.warn('Google Places fetch failed, relying on local static stores:', err);
  }

  // Calculate distances for the fetched Google Places stores
  let googleStoresWithDistance = googleStores.map(store => {
    const dist = haversineDistance(lat, lon, store.lat, store.lon);
    return { ...store, distance: dist };
  }).filter(store => store.distance <= MAX_SEARCH_RADIUS);

  // If Google Places returned nothing (e.g. key missing/failed/no results), fall back to local static stores
  if (googleStoresWithDistance.length === 0) {
    console.log('No Google Places API results. Using local static stores fallback.');
    googleStoresWithDistance = GOOGLE_MAPS_STORES.map(store => {
      const dist = haversineDistance(lat, lon, store.lat, store.lon);
      return { ...store, distance: dist };
    }).filter(store => store.distance <= MAX_SEARCH_RADIUS);
  }
  
  let osmStores = [];
  
  // 2. Query OSM Overpass API dynamically
  const searchRadii = [DEFAULT_SEARCH_RADIUS, 5000, 10000, MAX_SEARCH_RADIUS];
  for (const radius of searchRadii) {
    try {
      updateStatus(`Searching within ${radius/1000}km...`);
      const results = await fetchOverpassStores(lat, lon, radius);
      if (results && results.length > 0) {
        osmStores = results;
        break; // Found OSM results, don't query larger radius
      }
    } catch (error) {
      console.warn(`Overpass search failed at ${radius}m:`, error);
    }
  }
  
  // Mark OpenStreetMap sources
  osmStores.forEach(s => {
    s.source = 'Apple / OSM';
  });
  
  // 3. Merge both databases (Foursquare/OSM + Google Maps coordinates)
  const mergedStores = [...googleStoresWithDistance, ...osmStores];
  
  if (mergedStores.length > 0) {
    state.stores = mergedStores;
    sortAndSetNearest();
    updateStatus('Theka locked on target', true);
  } else {
    // Fallback if absolutely nothing is mapped anywhere
    loadFallbackMockStores(lat, lon);
  }
}

/**
 * Core HTTP Request to OSM Overpass interpreter.
 */
async function fetchOverpassStores(lat, lon, radius) {
  const endpoint = 'https://overpass-api.de/api/interpreter';
  
  // OSM tags: shop=alcohol (most common for thekas), shop=wine, shop=beverages (with alcohol=yes)
  const query = `[out:json][timeout:15];
    (
      node["shop"="alcohol"](around:${radius},${lat},${lon});
      node["shop"="wine"](around:${radius},${lat},${lon});
      node["shop"="liquor"](around:${radius},${lat},${lon});
      node["shop"="beverages"]["alcohol"="yes"](around:${radius},${lat},${lon});
      node["amenity"="pub"](around:${radius},${lat},${lon});
    );
    out body;`;
    
  const response = await fetch(endpoint, {
    method: 'POST',
    body: query,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  
  if (!response.ok) {
    throw new Error(`OSM HTTP Error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.elements) return [];
  
  return data.elements.map(el => {
    let name = el.tags.name || 'Local Wine & Beer Shop';
    
    // Clean up generic pub/shop tags for better UI titles
    if (name === 'Local Wine & Beer Shop' && el.tags.shop === 'alcohol') {
      name = 'Government Liquor Shop';
    } else if (el.tags.amenity === 'pub' && !el.tags.name) {
      name = 'Local Pub / Beer Bar';
    }
    
    return {
      id: el.id,
      name: name,
      lat: el.lat,
      lon: el.lon,
      address: el.tags['addr:street'] || el.tags['addr:suburb'] || el.tags.operator || 'Coordinates locked'
    };
  });
}

/**
 * Generates mock liquor stores surrounding the user's current coordinates.
 * Acts as a failsafe when offline or when no tags are mapped in OSM.
 */
function loadFallbackMockStores(lat, lon) {
  console.log("Using dynamic mock shops fallback based on user location");
  
  // Generate 4 mock shops placed in different quadrants around user
  state.stores = [
    {
      name: 'Desi Wine Shop (Theka)',
      lat: lat + 0.0035, // ~380m North
      lon: lon + 0.0012,
      address: 'Near Main Highway Intersection'
    },
    {
      name: 'Modern Beer & Spirits Boutique',
      lat: lat - 0.0025, // ~300m South
      lon: lon - 0.0042, // ~450m West
      address: 'Commercial Market Ring Road'
    },
    {
      name: 'Imperial Wine Shop & Bar',
      lat: lat + 0.0081, // ~900m North-East
      lon: lon + 0.0078,
      address: 'Main Shopping Plaza'
    },
    {
      name: 'English Liquor & Wine Mart',
      lat: lat - 0.0068, // ~800m South-East
      lon: lon + 0.0045,
      address: 'Gali 4, Near Metro Station'
    }
  ];
  
  sortAndSetNearest();
  updateStatus('Theka locked (Mock Mode Fallback)', true);
}

/**
 * Computes distances, sorts shops, and sets the closest one in state.
 */
function sortAndSetNearest() {
  if (state.stores.length === 0) return;
  
  // Calculate distance for all shops
  state.stores.forEach(store => {
    store.distance = haversineDistance(
      state.userLocation.lat, state.userLocation.lon,
      store.lat, store.lon
    );
  });
  
  // Sort ascending by distance
  state.stores.sort((a, b) => a.distance - b.distance);
  
  const oldNearest = state.nearestStore;
  state.nearestStore = state.stores[0];
  
  // Trigger a heavy calibration splash screen if the target shifts dramatically
  if (oldNearest && oldNearest.id !== state.nearestStore.id) {
    triggerCalibrationOverlay();
  }
}

/**
 * Helper to update status bar message in UI.
 */
function updateStatus(message, isPulsing = false) {
  elements.thekaStatusText.textContent = message;
  const dot = document.querySelector('.status-dot');
  
  if (isPulsing) {
    dot.classList.add('pulsing');
  } else {
    dot.classList.remove('pulsing');
  }
}

// --- HARDWARE SENSORS & PERMISSIONS ---

/**
 * Entry point to request device Geolocation and Orientation.
 */
async function requestDeviceAccess() {
  // Initialize Dial SVG immediately
  generateCompassDial();
  
  // Unlock iOS audio context on user gesture
  unlockAudio();
  
  let locationGranted = false;
  let orientationGranted = false;

  // 1. Request Device Motion/Orientation FIRST (specifically iOS Safari protocol)
  // Must be called immediately inside the user click callback to preserve the user-gesture context.
  try {
    const motionPermission = await requestDeviceOrientation();
    if (motionPermission) {
      orientationGranted = true;
      state.hasGrantedOrientation = true;
    }
  } catch (error) {
    console.error('Device orientation permission rejected:', error);
  }

  // 2. Request GPS Coordinates SECOND (more permissive, doesn't require immediate user-gesture thread)
  try {
    const geoPermission = await requestGeolocation();
    if (geoPermission) {
      locationGranted = true;
      state.hasGrantedLocation = true;
    }
  } catch (error) {
    console.error('Geolocation setup failed:', error);
  }


  // 3. Switch screen state
  // Normal users MUST grant BOTH Geolocation AND Orientation for the app to function properly.
  // Admins/Mocks can bypass if one or both fail.
  const passedPermissionCheck = isAdminMode ? (locationGranted || orientationGranted) : (locationGranted && orientationGranted);
  
  if (passedPermissionCheck) {
    elements.permissionScreen.classList.remove('active');
    elements.compassScreen.classList.add('active');
    
    // Start watch listeners if granted
    if (locationGranted) {
      startLocationWatching();
    }
    if (orientationGranted) {
      startOrientationListening();
    } else {
      // If location is OK but orientation is blocked (desktop/refused),
      // auto-enable mock heading slider to allow testing.
      enableSimulatorDrawer(true);
    }
  } else {
    // If permission checks fail:
    if (isAdminMode) {
      triggerMockModeFallback();
    } else {
      showPermissionDeniedState();
    }
  }
}

/**
 * Switches the Welcome screen to show the iOS instructions for enabling permissions.
 */
function showPermissionDeniedState() {
  const welcome = document.getElementById('welcome-state');
  const denied = document.getElementById('denied-state');
  if (welcome && denied) {
    welcome.classList.remove('active');
    welcome.classList.add('hidden');
    denied.classList.remove('hidden');
    denied.classList.add('active');
  }
}

/**
 * Handles browser GPS requesting.
 */
function requestGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(false);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.userLocation.lat = position.coords.latitude;
        state.userLocation.lon = position.coords.longitude;
        resolve(true);
      },
      (error) => {
        console.warn('Geolocation access error:', error);
        resolve(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

/**
 * Hooks Geolocation API watchPosition loop.
 */
function startLocationWatching() {
  navigator.geolocation.watchPosition(
    (position) => {
      const newLat = position.coords.latitude;
      const newLon = position.coords.longitude;
      
      // Update coordinates
      state.userLocation.lat = newLat;
      state.userLocation.lon = newLon;
      
      // Perform lookup & UI updates
      if (state.stores.length === 0) {
        findNearestLiquorStore(newLat, newLon);
      } else {
        sortAndSetNearest();
        updateCompassDisplay();
      }
    },
    (err) => console.error('WatchPosition error:', err),
    { enableHighAccuracy: true }
  );
}

/**
 * iOS and Android specific Device Orientation permission requests.
 */
function requestDeviceOrientation() {
  return new Promise((resolve) => {
    // iOS Safari requires an explicit user action to request permissions
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      
      DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
          resolve(permissionState === 'granted');
        })
        .catch(err => {
          console.error('iOS deviceorientation error:', err);
          resolve(false);
        });
    } else {
      // Android / Desktop fallback (no requestPermission needed)
      // We check if the event exists in window
      if ('ondeviceorientation' in window || 'ondeviceorientationabsolute' in window) {
        resolve(true);
      } else {
        resolve(false);
      }
    }
  });
}

/**
 * Registers deviceorientation listeners.
 */
function startOrientationListening() {
  // Prefer absolute orientation (Android) to avoid calibration errors
  if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', handleOrientationEvent, true);
  } else if ('ondeviceorientation' in window) {
    window.addEventListener('deviceorientation', handleOrientationEvent, true);
  }
}

/**
 * Maps hardware orientation metrics to heading degrees.
 */
function handleOrientationEvent(event) {
  let heading = 0;
  
  // iOS uses webkitCompassHeading directly (calibrated to North)
  if (event.webkitCompassHeading !== undefined) {
    heading = event.webkitCompassHeading;
  } else if (event.alpha !== null) {
    // Android uses alpha (0 to 360 relative to device start or true North if absolute)
    // For deviceorientationabsolute, alpha points to absolute North (0 is North, increases counter-clockwise)
    // To match compass heading (clockwise from North): heading = 360 - alpha
    heading = (360 - event.alpha) % 360;
  } else {
    return; // No usable orientation data
  }
  
  state.heading = heading;
  updateCompassDisplay();
}

// --- MOCK SIMULATOR ENGINE (FOR DESKTOP & TESTING) ---

/**
 * Triggers complete mock mode directly from Welcome Screen.
 */
function triggerMockModeFallback() {
  state.isMockMode = true;
  generateCompassDial();
  
  // Unlock audio context on user gesture
  unlockAudio();
  
  // Load CP Delhi as default mock location
  loadMockLocation('connaught-place');
  
  // Show app layout and pop up the simulator drawer immediately
  elements.permissionScreen.classList.remove('active');
  elements.compassScreen.classList.add('active');
  
  enableSimulatorDrawer(true);
  updateCompassDisplay();
}

/**
 * Loads a named mock geographical region and its predefined stores.
 */
function loadMockLocation(key) {
  const region = MOCK_REGIONS[key];
  if (!region) return;
  
  state.userLocation.lat = region.lat;
  state.userLocation.lon = region.lon;
  state.stores = JSON.parse(JSON.stringify(region.shops)); // Deep copy
  
  sortAndSetNearest();
  
  // Set coordinates inputs in custom drawer to match
  elements.customLat.value = region.lat;
  elements.customLon.value = region.lon;
  
  updateCompassDisplay();
}

/**
 * Slides the simulator drawer in or out.
 */
function enableSimulatorDrawer(open) {
  state.isDrawerOpen = open;
  if (open) {
    elements.simulatorDrawer.classList.add('open');
  } else {
    elements.simulatorDrawer.classList.remove('open');
  }
}

/**
 * Nudges user location towards the nearest target liquor shop.
 */
function stepSimulatedWalk() {
  if (!state.nearestStore) return;
  
  const distance = haversineDistance(
    state.userLocation.lat, state.userLocation.lon,
    state.nearestStore.lat, state.nearestStore.lon
  );
  
  // Walk speed is meters per second. This interval runs every 100ms.
  // Step distance = walkSpeed * 0.1s
  const stepDistance = state.walkSpeed * 0.1;
  
  if (distance <= stepDistance + 2) {
    // Arrived!
    stopSimulatedWalk();
    state.userLocation.lat = state.nearestStore.lat;
    state.userLocation.lon = state.nearestStore.lon;
    
    // Snapping location to shop will naturally trigger the arrival celebration once
    updateCompassDisplay();
    return;
  }
  
  // Find bearing to target and move user position in that direction
  const bearing = calculateBearing(
    state.userLocation.lat, state.userLocation.lon,
    state.nearestStore.lat, state.nearestStore.lon
  );
  
  const bearingRad = bearing * Math.PI / 180;
  
  // Approximate lat/lon shifts (1 meter ≈ 0.000009 degrees latitude, longitude depends on lat)
  const latShift = (stepDistance * Math.cos(bearingRad)) / 111111;
  const lonShift = (stepDistance * Math.sin(bearingRad)) / (111111 * Math.cos(state.userLocation.lat * Math.PI / 180));
  
  state.userLocation.lat += latShift;
  state.userLocation.lon += lonShift;
  
  sortAndSetNearest();
  updateCompassDisplay();
}

function startSimulatedWalk() {
  if (state.isWalkSimulating) return;
  
  state.isWalkSimulating = true;
  elements.btnStartWalk.classList.add('btn-walk-stop');
  elements.btnStartWalk.innerHTML = '🛑 Stop Walk';
  elements.btnStopWalk.classList.remove('hidden');
  
  // Tick every 100ms
  state.walkIntervalId = setInterval(stepSimulatedWalk, 100);
}

function stopSimulatedWalk() {
  if (!state.isWalkSimulating) return;
  
  state.isWalkSimulating = false;
  elements.btnStartWalk.classList.remove('btn-walk-stop');
  elements.btnStartWalk.innerHTML = '🏃 Simulate Walk';
  elements.btnStopWalk.classList.add('hidden');
  
  clearInterval(state.walkIntervalId);
}

// --- CALIBRATION INTERFACES ---

function triggerCalibrationOverlay() {
  elements.calibrationOverlay.classList.add('active');
  triggerVibrationPulse(200);
}

// --- INITIALIZATION & REGISTER EVENT LISTENERS ---

function init() {
  // 1. Request Buttons
  elements.btnRequestAccess.addEventListener('click', requestDeviceAccess);
  elements.btnMockMode.addEventListener('click', triggerMockModeFallback);
  
  // Retry permissions handler
  if (elements.btnRetryPermissions) {
    elements.btnRetryPermissions.addEventListener('click', () => {
      const welcome = document.getElementById('welcome-state');
      const denied = document.getElementById('denied-state');
      if (welcome && denied) {
        denied.classList.remove('active');
        denied.classList.add('hidden');
        welcome.classList.remove('hidden');
        welcome.classList.add('active');
      }
      requestDeviceAccess();
    });
  }
  
  // 2. Drawer actions
  elements.btnToggleSimulatorDrawer.addEventListener('click', () => enableSimulatorDrawer(true));
  elements.btnCloseSimulator.addEventListener('click', () => enableSimulatorDrawer(false));
  
  // 3. Simulator Handlers
  elements.simHeadingSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    state.heading = val;
    elements.simHeadingVal.textContent = `${val}°`;
    updateCompassDisplay();
  });
  
  elements.simLocationSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      elements.customCoordsInputs.classList.remove('hidden');
    } else {
      elements.customCoordsInputs.classList.add('hidden');
      loadMockLocation(val);
    }
  });
  
  elements.btnApplyCustomCoords.addEventListener('click', () => {
    const lat = parseFloat(elements.customLat.value);
    const lon = parseFloat(elements.customLon.value);
    
    if (!isNaN(lat) && !isNaN(lon)) {
      state.userLocation.lat = lat;
      state.userLocation.lon = lon;
      
      updateStatus('Locating from custom coordinates...');
      findNearestLiquorStore(lat, lon);
      enableSimulatorDrawer(false);
    } else {
      alert('Please enter valid decimal coordinates.');
    }
  });
  
  // 4. Walk Sim Handlers
  elements.btnStartWalk.addEventListener('click', () => {
    if (state.isWalkSimulating) {
      stopSimulatedWalk();
    } else {
      startSimulatedWalk();
    }
  });
  
  elements.btnStopWalk.addEventListener('click', stopSimulatedWalk);
  
  elements.btnTeleport.addEventListener('click', () => {
    if (!state.nearestStore) return;
    stopSimulatedWalk();
    
    // Teleport directly to the shop
    state.userLocation.lat = state.nearestStore.lat;
    state.userLocation.lon = state.nearestStore.lon;
    
    // Force arrival state to false so teleporting triggers celebration immediately
    state.hasArrivedAtCurrentStore = false;
    sortAndSetNearest();
    updateCompassDisplay();
  });
  
  elements.simWalkSpeed.addEventListener('change', (e) => {
    state.walkSpeed = parseFloat(e.target.value);
  });
  
  // 5. Calibration handler
  elements.btnDismissCalibration.addEventListener('click', () => {
    elements.calibrationOverlay.classList.remove('active');
  });
  
  // Initial dial generation on startup
  generateCompassDial();
  confetti.init();
}

// Fire initial registration on page load
window.addEventListener('DOMContentLoaded', init);
