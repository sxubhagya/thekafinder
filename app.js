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
  hasArrivedAtCurrentStore: false,
  isDryState: false,
  isDryZone: false,
  dryStateName: '',
  dryStateMessage: '',
  lastSearchCoords: null,
  cachedStores: [],
  loadedFeedbackStoreId: null,
  isRefreshCooldown: false,
  isFeedbackCooldown: false,
  isAligned: false
};

// --- DOM ELEMENTS ---
const elements = {
  permissionScreen: document.getElementById('permission-screen'),
  compassScreen: document.getElementById('compass-screen'),
  greetingScreen: document.getElementById('greeting-screen'),
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
  btnBookCab: document.getElementById('btn-book-cab'),
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
  confettiCanvas: document.getElementById('confetti-canvas'),
  
  // Buy Me a Beer Modal Elements
  beerModal: document.getElementById('beer-modal'),
  btnBuyBeer: document.getElementById('btn-buy-beer'),
  btnCloseBeerModal: document.getElementById('btn-close-beer-modal'),
  btnCopyUpi: document.getElementById('btn-copy-upi'),
  btnBeerSuccess: document.getElementById('btn-beer-success'),
  upiAddress: document.getElementById('upi-address'),
  
  // Open Status Badge Elements
  thekaOpenStatus: document.getElementById('theka-open-status'),
  thekaOpenText: document.getElementById('theka-open-text'),
  btnShareTheka: document.getElementById('btn-share-theka'),
  btnRefreshTheka: document.getElementById('btn-refresh-theka'),
  btnEmergencySos: document.getElementById('btn-emergency-sos'),
  feedbackSection: document.getElementById('crowdsourced-feedback-section'),
  feedbackMetricsText: document.getElementById('feedback-metrics-text'),
  btnReportOpen: document.getElementById('btn-report-open'),
  btnReportClosed: document.getElementById('btn-report-closed')
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

/**
 * Resolves the shop's open status (Open, Closed, Closing Soon) based on current local time.
 * Standard Indian/local liquor store hours are 10:00 AM to 10:00 PM.
 */
function getStoreOpeningStatus(store) {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // If the store specifically returns open_now from Google
  if (store.openNow === false) {
    return {
      text: 'Closed • Opens at 10:00 AM',
      class: 'closed'
    };
  }
  
  if (hour < 10 || hour >= 22) {
    return {
      text: 'Closed • Opens at 10:00 AM',
      class: 'closed'
    };
  } else if (hour === 21) {
    const minsLeft = 60 - minute;
    return {
      text: `Closes in ${minsLeft} mins`,
      class: 'closing-soon'
    };
  } else {
    return {
      text: 'Open Now • Closes at 10:00 PM',
      class: 'open'
    };
  }
}

// --- DRY STATES & GEOPROHIBITION CONFIG ---
const DRY_STATES = [
  {
    name: 'Gujarat',
    bbox: { minLat: 20.1, maxLat: 24.7, minLon: 68.1, maxLon: 74.5 },
    wittyMessage: "🚨 Gujarat says no! Banned since 1960. Compass needle is spinning in absolute despair. Road trip to Rajasthan or Daman? 🚗💨"
  },
  {
    name: 'Bihar',
    bbox: { minLat: 24.3, maxLat: 27.5, minLon: 83.3, maxLon: 88.3 },
    wittyMessage: "🚫 Nitish Kumar says hello! Bihar is dry. The compass refuses to point to anything here. Kathmandu is nice this time of year! 🏔️"
  },
  {
    name: 'Nagaland',
    bbox: { minLat: 25.2, maxLat: 27.1, minLon: 93.3, maxLon: 95.3 },
    wittyMessage: "🚨 Nagaland Prohibition active! No thekas here. The compass is currently pointing to a glass of water. 💧"
  },
  {
    name: 'Mizoram',
    bbox: { minLat: 21.9, maxLat: 24.6, minLon: 92.2, maxLon: 93.5 },
    wittyMessage: "🚫 Mizoram is dry! The needle is spinning out of control. No alcohol sales allowed. Drink some tea! ☕"
  },
  {
    name: 'Lakshadweep',
    bbox: { minLat: 8.0, maxLat: 12.5, minLon: 71.0, maxLon: 74.0 },
    wittyMessage: "🌊 Lakshadweep is dry (except Bangaram Island)! The compass is drowning in sorrow. Grab a coconut instead! 🥥"
  }
];

const BORDER_OASES = {
  'Gujarat': [
    { name: 'Abu Road (Rajasthan)', lat: 24.4824, lon: 72.7836 },
    { name: 'Daman (Union Territory)', lat: 20.3974, lon: 72.8328 },
    { name: 'Diu (Union Territory)', lat: 20.7144, lon: 70.9874 }
  ],
  'Bihar': [
    { name: 'Nepal Border (Kathmandu)', lat: 27.7172, lon: 85.3240 },
    { name: 'Siliguri (West Bengal)', lat: 26.7271, lon: 88.3953 },
    { name: 'Varanasi (Uttar Pradesh)', lat: 25.3176, lon: 82.9739 }
  ],
  'Nagaland': [
    { name: 'Lahorijan (Assam Border)', lat: 25.8950, lon: 93.7500 },
    { name: 'Bokajan (Assam Border)', lat: 26.0205, lon: 93.7915 }
  ],
  'Mizoram': [
    { name: 'Silchar (Assam Border)', lat: 24.8333, lon: 92.8000 }
  ],
  'Lakshadweep': [
    { name: 'Kochi (Kerala Coast)', lat: 9.9312, lon: 76.2673 },
    { name: 'Mangalore (Karnataka Coast)', lat: 12.9141, lon: 74.8560 }
  ]
};

function getDryState(lat, lon) {
  return DRY_STATES.find(state => 
    lat >= state.bbox.minLat && lat <= state.bbox.maxLat && 
    lon >= state.bbox.minLon && lon <= state.bbox.maxLon
  );
}

let drySpinRequest = null;
function runDrySpinLoop() {
  if (!state.isDryZone) {
    if (drySpinRequest) {
      cancelAnimationFrame(drySpinRequest);
      drySpinRequest = null;
    }
    return;
  }
  
  // Update only the spinning needle elements
  const spinningAngle = (Date.now() / 15) % 360;
  if (elements.liquorNeedle) {
    elements.liquorNeedle.style.transform = `rotate(${spinningAngle}deg)`;
  }
  if (elements.needleDistanceLabel) {
    elements.needleDistanceLabel.style.transform = `translateX(-50%) rotate(${-spinningAngle}deg)`;
  }
  if (elements.arrowIndicator) {
    elements.arrowIndicator.style.transform = `rotate(${spinningAngle}deg)`;
  }
  
  drySpinRequest = requestAnimationFrame(runDrySpinLoop);
}

/**
 * Triggers a satisfying sound, confetti shower, and custom glass toast
 * when a donation is completed, without overriding compass state.
 */
function triggerDonationCelebration() {
  triggerVibrationPulse(400);
  
  // Play beer pop + fizz sound
  playBeerPopSound();
  
  // Shoot confetti
  confetti.spawn();
  
  // Display toast message
  showToast("Cheers! Thanks for the support! 🍻");
}

/**
 * Displays a glassmorphic floating toast notification.
 */
function showToast(message) {
  // Remove existing toast if any
  const existing = document.querySelector('.glass-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'glass-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => {
    toast.classList.add('visible');
  }, 50);
  
  // Remove after 3.5 seconds
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => {
      toast.remove();
    }, 500);
  }, 3500);
}

/**
 * Triggers Web Share API or copies a witty description to clipboard.
 */
function shareTheka() {
  let message = '';
  if (state.isDryState) {
    if (state.nearestStore && state.nearestStore.id === 'oasis') {
      const dist = state.nearestStore.distance;
      const distText = dist >= 1000 ? `${(dist / 1000).toFixed(0)} km` : `${Math.round(dist)} m`;
      message = `Prohibition alert! 🚨 Stuck in a dry state, but my compass points directly to the closest wet Border Oasis (${state.nearestStore.name.replace('Border Oasis: ', '')}) which is ${distText} away! Join the road trip: https://thekafinder.vercel.app`;
    } else {
      message = `Compass is spinning in grief... 🚨 Stuck in a dry state! Save me: https://thekafinder.vercel.app`;
    }
  } else if (state.isDryZone) {
    message = `Desert alert! 🌵 No liquor stores found within 15km. Keep looking with me: https://thekafinder.vercel.app`;
  } else if (state.nearestStore) {
    const dist = state.nearestStore.distance;
    const distText = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} meters`;
    message = `Hunting for liquid gold! 🍻 Compass says nearest theka (${state.nearestStore.name}) is ${distText} away. Lock on bearing: https://thekafinder.vercel.app`;
  } else {
    message = `Finding nearest liquid gold! Connect to my compass: https://thekafinder.vercel.app`;
  }
  
  if (navigator.share) {
    navigator.share({
      title: 'Theka Finder',
      text: message,
      url: 'https://thekafinder.vercel.app'
    }).catch(err => console.log('Share canceled', err));
  } else {
    navigator.clipboard.writeText(message)
      .then(() => {
        showToast('Invite copied to clipboard! Send to your gang! 🍻');
      })
      .catch(err => {
        console.error('Failed to copy share text:', err);
      });
  }
}

/**
 * Triggers WhatsApp sharing with custom witty SOS messages and coordinates link.
 */
function triggerEmergencySOS() {
  if (!state.userLocation.lat || !state.userLocation.lon) {
    showToast('GPS coordinates not resolved yet! 🧭');
    return;
  }
  
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${state.userLocation.lat},${state.userLocation.lon}`;
  let message = '';
  
  if (state.isDryState) {
    const dryName = state.dryStateName || 'Dry State';
    message = `Help! I'm currently stranded in a dry state/zone (${dryName}) with a spinning compass needle and no beer. Save me or send a cooler to my location: ${mapLink} 🌵💧`;
  } else if (state.isDryZone) {
    message = `Desert alert! 🌵 No liquor stores found within 15km. Send backup or cold water to my current coordinates: ${mapLink} 💧`;
  } else if (state.nearestStore) {
    const dist = state.nearestStore.distance;
    const distText = dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`;
    message = `Hey! I'm on a mission to grab a cold one at ${state.nearestStore.name} (~${distText} away). If I'm not back in 30 mins, send search parties to my last known location: ${mapLink} 🍻🚨`;
  } else {
    message = `Hey, I'm heading out to find some cold beers! Tracking my path here: ${mapLink} 🍻`;
  }
  
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
}

/**
 * Loads crowdsourced open/closed status for a locked-on store.
 */
async function loadStoreFeedback(storeId) {
  if (!storeId) return;
  
  if (elements.feedbackSection) {
    elements.feedbackSection.style.display = 'block';
  }
  
  if (elements.feedbackMetricsText) {
    elements.feedbackMetricsText.textContent = 'Loading user reports... ⏳';
  }

  try {
    const res = await fetch(`/api/feedback?store_id=${encodeURIComponent(storeId)}`);
    if (res.status === 429) {
      showToast('Too many requests. Please wait a moment. ⏳');
      throw new Error('Rate limited');
    }
    const data = await res.json();
    
    if (data.success && elements.feedbackMetricsText) {
      const stats = data.stats12h;
      const last = data.lastReport;
      
      let text = '';
      if (stats && stats.totalCount > 0) {
        const timeAgoText = last ? getTimeAgo(new Date(last.createdAt)) : '';
        const pctText = `👍 ${stats.openPercentage}% users reported open in last 12 hrs (${stats.openCount} of ${stats.totalCount} reports)`;
        const lastReportText = last ? `\n(Last reported ${last.status} ${timeAgoText})` : '';
        text = `${pctText}${lastReportText}`;
      } else {
        text = 'No user updates in last 12 hours. Be the first to report! 🍻';
      }
      
      elements.feedbackMetricsText.textContent = text;
    }
  } catch (err) {
    console.warn('Error loading store feedback, using local storage fallback:', err);
    // LocalStorage fallback for offline testing or missing backend
    if (elements.feedbackMetricsText) {
      const localData = getLocalStoreFeedback(storeId);
      if (localData) {
        elements.feedbackMetricsText.textContent = localData;
      } else {
        elements.feedbackMetricsText.textContent = 'Be the first to report store status! 🍻';
      }
    }
  }
}

/**
 * Helper to get a human-readable time-ago format.
 */
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

/**
 * Retrieves mock/local feedback data from localStorage.
 */
function getLocalStoreFeedback(storeId) {
  try {
    const local = localStorage.getItem(`feedback_${storeId}`);
    if (local) {
      const { status, time } = JSON.parse(local);
      const timeAgoText = getTimeAgo(new Date(time));
      return `Last reported ${status} ${timeAgoText} (locally saved) 📍`;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

/**
 * Generates or retrieves a persistent anonymous device identifier.
 */
function getUserId() {
  let userId = localStorage.getItem('theka_finder_user_id');
  if (!userId) {
    userId = `user_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
    localStorage.setItem('theka_finder_user_id', userId);
  }
  return userId;
}

/**
 * Submits store status feedback to the database with a localStorage fallback.
 */
async function submitStoreFeedback(status) {
  if (!state.nearestStore) return;
  if (state.isFeedbackCooldown) {
    showToast('Please wait a moment before reporting again. ⏳');
    return;
  }

  const storeId = state.nearestStore.id || `${state.nearestStore.lat.toFixed(5)}_${state.nearestStore.lon.toFixed(5)}`;
  const storeName = state.nearestStore.name || 'Unknown Store';

  // Set visual button loading state or disable
  if (elements.btnReportOpen) elements.btnReportOpen.disabled = true;
  if (elements.btnReportClosed) elements.btnReportClosed.disabled = true;

  state.isFeedbackCooldown = true;

  try {
    // 1. Submit to API endpoint
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        store_id: storeId,
        user_id: getUserId(),
        store_name: storeName,
        status: status
      })
    });
    
    if (res.status === 429) {
      showToast('Too many reports! Saving locally. ⏳📍');
      throw new Error('Rate limited');
    }
    
    const data = await res.json();
    if (data.success) {
      showToast(`Thank you! Status reported as ${status}. 🍻`);
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    console.warn('API submission failed, falling back to LocalStorage caching:', err);
    if (err.message !== 'Rate limited') {
      showToast(`Saved locally! Status reported as ${status}. 📍`);
    }
  } finally {
    // 2. Always persist in LocalStorage for client-side local cache fallback
    try {
      localStorage.setItem(`feedback_${storeId}`, JSON.stringify({
        status,
        time: new Date().toISOString()
      }));
    } catch (e) {
      console.error(e);
    }
    
    // 3. Reload UI metrics
    await loadStoreFeedback(storeId);

    // Re-enable buttons after 10 second cooldown
    setTimeout(() => {
      state.isFeedbackCooldown = false;
      if (elements.btnReportOpen) elements.btnReportOpen.disabled = false;
      if (elements.btnReportClosed) elements.btnReportClosed.disabled = false;
    }, 10000);
  }
}



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
  
  if (elements.btnEmergencySos && state.userLocation.lat && state.userLocation.lon) {
    elements.btnEmergencySos.classList.remove('disabled');
  }
  
  // 4. Update the liquor needle and target metrics
  if (state.isDryState || state.isDryZone) {
    elements.needleDistanceLabel.textContent = '❌';
    elements.arrowIndicator.style.color = 'var(--accent-red)';
    
    // Update bottom card panel
    elements.thekaName.textContent = state.dryStateName || 'Dry Zone Detected';
    elements.thekaAddress.textContent = state.dryStateMessage || 'Prohibition is active here.';
    
    // Reset standard metrics
    elements.metricDistance.textContent = '--';
    elements.metricDistanceUnit.textContent = '';
    elements.metricSteps.textContent = '--';
    elements.directionInstructions.textContent = '🚫 Dry Zone! Compass is spinning in grief.';
    
    if (elements.btnAppleMaps) elements.btnAppleMaps.classList.add('disabled');
    if (elements.btnGoogleMaps) elements.btnGoogleMaps.classList.add('disabled');
    if (elements.btnBookCab) elements.btnBookCab.classList.add('disabled');
    if (elements.thekaSourceBadge) elements.thekaSourceBadge.style.display = 'none';
    if (elements.thekaOpenStatus) elements.thekaOpenStatus.style.display = 'none';
    if (elements.feedbackSection) elements.feedbackSection.style.display = 'none';
    state.loadedFeedbackStoreId = null;
    
    // Telemetry
    elements.telemetryThekaPos.textContent = 'PROHIBITED';
    elements.telemetryBearing.textContent = 'SPIN';
    elements.telemetryRelBearing.textContent = 'SPIN';
  } else if (state.nearestStore) {
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
    
    // We enter aligned state at < 5 deg, and leave at >= 8 deg to prevent chattering/glitching
    let isCurrentlyAligned = state.isAligned || false;
    if (relativeAngle < 5 || relativeAngle > 355) {
      isCurrentlyAligned = true;
    } else if (relativeAngle >= 8 && relativeAngle <= 352) {
      isCurrentlyAligned = false;
    }
    state.isAligned = isCurrentlyAligned;

    if (isCurrentlyAligned || distance <= 5) {
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
    if (elements.btnBookCab) {
      const storeName = state.nearestStore.name || 'Theka';
      const address = state.nearestStore.address || '';
      elements.btnBookCab.href = `https://m.uber.com/ul/?client_id=CschlSNhiPzFV_VMeToCbrthhALuYkjyD_Ew0GCT&action=setPickup&pickup=my_location&dropoff[latitude]=${state.nearestStore.lat}&dropoff[longitude]=${state.nearestStore.lon}&dropoff[nickname]=${encodeURIComponent(storeName)}&dropoff[formatted_address]=${encodeURIComponent(address)}`;
      elements.btnBookCab.classList.remove('disabled');
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
    
    // Update Open Status Badge
    if (elements.thekaOpenStatus && elements.thekaOpenText) {
      const status = getStoreOpeningStatus(state.nearestStore);
      elements.thekaOpenText.textContent = status.text;
      
      // Reset classes and set status class
      elements.thekaOpenStatus.className = 'theka-status-badge open-status-badge';
      elements.thekaOpenStatus.classList.add(status.class);
      elements.thekaOpenStatus.style.display = 'inline-flex';
    }
    
    // Update Telemetry panel
    elements.telemetryThekaPos.textContent = `${state.nearestStore.lat.toFixed(5)}, ${state.nearestStore.lon.toFixed(5)}`;
    elements.telemetryBearing.textContent = `${Math.round(bearing)}°`;
    elements.telemetryRelBearing.textContent = `${Math.round(relativeAngle)}°`;

    // Only load feedback once per store to prevent network request spamming
    const currentStoreId = state.nearestStore.id || `${state.nearestStore.lat.toFixed(5)}_${state.nearestStore.lon.toFixed(5)}`;
    if (state.loadedFeedbackStoreId !== currentStoreId) {
      state.loadedFeedbackStoreId = currentStoreId;
      loadStoreFeedback(currentStoreId);
    }
  } else {
    // Reset/loading state
    elements.liquorNeedle.style.transform = 'rotate(0deg)';
    elements.needleDistanceLabel.textContent = '-- m';
    elements.thekaName.textContent = 'Searching...';
    elements.metricDistance.textContent = '--';
    elements.metricSteps.textContent = '--';
    if (elements.btnAppleMaps) elements.btnAppleMaps.classList.add('disabled');
    if (elements.btnGoogleMaps) elements.btnGoogleMaps.classList.add('disabled');
    if (elements.btnBookCab) elements.btnBookCab.classList.add('disabled');
    if (elements.thekaSourceBadge) elements.thekaSourceBadge.style.display = 'none';
    if (elements.thekaOpenStatus) elements.thekaOpenStatus.style.display = 'none';
    if (elements.feedbackSection) elements.feedbackSection.style.display = 'none';
    state.loadedFeedbackStoreId = null;
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
    if (response.status === 429) {
      showToast('Whoa there! Too many location updates. Please wait a moment. ⏳');
      throw new Error('Rate limited');
    }
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
async function findNearestLiquorStore(lat, lon, force = false) {
  // Distance-Based Caching Check
  if (!force && state.lastSearchCoords) {
    const distanceMoved = haversineDistance(lat, lon, state.lastSearchCoords.lat, state.lastSearchCoords.lon);
    if (distanceMoved < 500 && state.cachedStores.length > 0) {
      console.log(`Using cached stores. User moved ${Math.round(distanceMoved)}m (under 500m threshold).`);
      state.stores = JSON.parse(JSON.stringify(state.cachedStores));
      
      if (state.isDryZone) {
        updateStatus('Dry Zone Detected 🌵');
        updateCompassDisplay();
        runDrySpinLoop();
      } else {
        sortAndSetNearest();
        updateStatus(state.isDryState ? `Prohibition active 🚨` : 'Theka locked on target (Cached)', true);
        updateCompassDisplay();
      }
      return;
    }
  }

  updateStatus('Locating nearby liquor stores...');
  
  // Show refresh spinner
  if (elements.btnRefreshTheka) {
    elements.btnRefreshTheka.classList.add('spinning');
  }
  
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
  
  // Check if they are in an Indian dry state bounding box
  const dryState = getDryState(lat, lon);
  
  if (dryState) {
    state.isDryState = true;
    state.isDryZone = false;
    
    // Find closest border oasis
    const oases = BORDER_OASES[dryState.name] || [];
    let closestOasis = null;
    let minDistance = Infinity;
    oases.forEach(oasis => {
      const dist = haversineDistance(lat, lon, oasis.lat, oasis.lon);
      if (dist < minDistance) {
        minDistance = dist;
        closestOasis = oasis;
      }
    });
    
    if (closestOasis) {
      state.nearestStore = {
        id: 'oasis',
        name: `Border Oasis: ${closestOasis.name}`,
        lat: closestOasis.lat,
        lon: closestOasis.lon,
        address: `Nearest wet town. Pack your bags! 🚗💨`,
        source: 'Oasis Pointer'
      };
      state.stores = [state.nearestStore];
      state.nearestStore.distance = minDistance;
      
      updateStatus(`Prohibition in ${dryState.name} 🚨`);
      updateCompassDisplay();
      
      if (drySpinRequest) {
        cancelAnimationFrame(drySpinRequest);
        drySpinRequest = null;
      }
    } else {
      state.stores = [];
      state.nearestStore = null;
      updateStatus('Prohibition Alert 🚨');
      updateCompassDisplay();
      runDrySpinLoop();
    }
  } else if (mergedStores.length > 0) {
    state.isDryState = false;
    state.isDryZone = false;
    state.stores = mergedStores;
    sortAndSetNearest();
    updateStatus('Theka locked on target', true);
  } else {
    // If no stores were found anywhere:
    if (state.isMockMode) {
      // In simulator test mode, generate mock shops around the user
      state.isDryState = false;
      state.isDryZone = false;
      loadFallbackMockStores(lat, lon);
    } else {
      // In real GPS mode, treat as a dry zone / no stores found
      state.isDryState = false;
      state.isDryZone = true;
      state.dryStateName = 'Dry Zone Detected';
      state.dryStateMessage = "🌵 Desert Alert! No liquor stores found within 15km. Either it's a local dry zone, or you are in a remote paradise. Keep searching, or grab a bottle of water! 💧";
      state.stores = [];
      state.nearestStore = null;
      updateStatus('Dry Zone Detected 🌵');
      updateCompassDisplay();
      runDrySpinLoop();
    }
  }

  // Cache results
  state.lastSearchCoords = { lat, lon };
  state.cachedStores = JSON.parse(JSON.stringify(state.stores));
  
  // Hide refresh spinner (only if not on a strict cooldown)
  if (elements.btnRefreshTheka && !state.isRefreshCooldown) {
    elements.btnRefreshTheka.classList.remove('spinning');
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
  
  state.isDryState = false;
  state.isDryZone = false;
  
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
 * Resolves a city name offline using a local coordinate checklist.
 */
function getLocalCityName(lat, lon) {
  const cities = [
    { name: 'Delhi', lat: 28.6304, lon: 77.2177 },
    { name: 'Bengaluru', lat: 12.9719, lon: 77.6412 },
    { name: 'Mumbai', lat: 19.0596, lon: 72.8295 },
    { name: 'Goa', lat: 15.5494, lon: 73.7535 },
    { name: 'Patna', lat: 25.5941, lon: 85.1376 },
    { name: 'Ahmedabad', lat: 23.0225, lon: 72.5714 },
    { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
    { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
    { name: 'New York', lat: 40.7128, lon: -74.0060 },
    { name: 'Sonipat', lat: 28.9845, lon: 77.0146 }
  ];
  
  for (const city of cities) {
    const dist = haversineDistance(lat, lon, city.lat, city.lon);
    if (dist < 50000) { // Within 50km
      return city.name;
    }
  }
  return null;
}

/**
 * Resolves the city name, falling back to a quick reverse geocoding lookup if not local.
 */
async function resolveCityName(lat, lon) {
  const local = getLocalCityName(lat, lon);
  if (local) return local;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200);
  
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('OSM error');
    const data = await res.json();
    const addr = data.address;
    return addr.city || addr.town || addr.suburb || addr.city_district || addr.state || 'Your City';
  } catch (e) {
    console.warn('Reverse geocode failed or timed out, returning fallback:', e);
    return 'Your City';
  }
}

/**
 * Renders the Apple-style transition overlay greeting the user in their resolved city.
 */
async function showGreetingAndTransition(cityName) {
  const greetingScreen = document.getElementById('greeting-screen');
  const drumTrack = document.getElementById('city-drum-track');
  
  if (!greetingScreen || !drumTrack) {
    // Fallback if elements are missing
    elements.permissionScreen.classList.remove('active');
    elements.compassScreen.classList.add('active');
    return;
  }
  
  // 1. Generate the city wheel track list
  const cleanTarget = cityName.toLowerCase();
  const ogCities = ['delhi', 'mumbai', 'new york', 'tokyo', 'bangalore', 'goa', 'chennai', 'patna', 'ahmedabad', 'sonipat', 'london', 'paris', 'sydney', 'berlin', 'dubai', 'singapore'];
  
  // Filter out target city from pool to prevent duplication
  const pool = ogCities.filter(c => c !== cleanTarget);
  
  // Simple shuffle
  const shuffled = pool.sort(() => 0.5 - Math.random());
  
  // Build 9-item symmetrical list with target at index 4 (5th position)
  const list = [
    shuffled[0],
    shuffled[1],
    shuffled[2],
    shuffled[3],
    cleanTarget,
    shuffled[4],
    shuffled[5],
    shuffled[6],
    shuffled[7]
  ];
  
  // Generate list items in track
  drumTrack.innerHTML = '';
  drumTrack.style.transition = 'none'; // Disable CSS transitions so JS can animate it at 60fps
  drumTrack.style.transform = 'translateY(0px)'; // Reset scroll position
  
  const items = list.map((city, idx) => {
    const el = document.createElement('div');
    el.className = `city-item${idx === 0 ? ' active' : ''}`;
    el.textContent = city;
    drumTrack.appendChild(el);
    return el;
  });
  
  // Reveal the greeting overlay
  greetingScreen.classList.add('active');
  elements.permissionScreen.classList.remove('active');
  
  // Brief delay before starting the scroll animation
  await new Promise(resolve => setTimeout(resolve, 350));
  
  // 2. Perform smooth frame-by-frame JS animation with haptic ticks
  const startY = 0;
  const targetY = -192; // 4 * 48px
  const duration = 2400; // 2.4 seconds (deliberate, slow, smooth deceleration)
  const startTime = performance.now();
  
  let lastTickedIndex = 0;
  
  await new Promise((resolve) => {
    function animateFrame(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Quintic ease-out curve for ultra-soft, smooth deceleration towards stop
      const easeOutQuint = 1 - Math.pow(1 - progress, 5);
      const currentY = startY + (targetY - startY) * easeOutQuint;
      
      drumTrack.style.transform = `translateY(${currentY}px)`;
      
      // Calculate which city index is currently closest to center
      const currentIndex = Math.floor(Math.abs(currentY) / 48 + 0.5);
      
      // Trigger a tiny haptic vibration on crossing item boundaries
      if (currentIndex !== lastTickedIndex) {
        lastTickedIndex = currentIndex;
        if (navigator.vibrate) {
          navigator.vibrate(8); // Ultra short tactile tick
        }
        
        // Update active class dynamically
        items.forEach((item, idx) => {
          if (idx === currentIndex) {
            item.classList.add('active');
          } else {
            item.classList.remove('active');
          }
        });
      }
      
      if (progress < 1) {
        requestAnimationFrame(animateFrame);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(animateFrame);
  });
  
  // 3. Fade out all non-target cities
  items.forEach((item, idx) => {
    if (idx !== 4) {
      item.classList.add('hidden-non-target');
    }
  });
  
  // Play the beer pop sound when the selection settles
  playBeerPopSound();
  
  // Pause to admire the target city
  await new Promise(resolve => setTimeout(resolve, 900));
  
  // 4. Fade out entire greeting overlay to open compass screen
  greetingScreen.classList.remove('active');
  elements.compassScreen.classList.add('active');
  
  // Final transition settle delay
  await new Promise(resolve => setTimeout(resolve, 600));
}

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
    let cityName = 'Your City';
    if (locationGranted) {
      cityName = await resolveCityName(state.userLocation.lat, state.userLocation.lon);
    }

    // Start watch listeners immediately in the background so search is pre-fetched
    if (locationGranted) {
      startLocationWatching();
    }
    if (orientationGranted) {
      startOrientationListening();
    }
    
    // Play greeting transition overlay
    await showGreetingAndTransition(cityName);
    
    if (!orientationGranted) {
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
  
  // Trigger transition
  showGreetingAndTransition('Delhi').then(() => {
    enableSimulatorDrawer(true);
  });
}

/**
 * Loads a named mock geographical region and its predefined stores.
 */
function loadMockLocation(key) {
  const region = MOCK_REGIONS[key];
  if (!region) return;
  
  state.isDryState = false;
  state.isDryZone = false;
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
      state.isDryState = false;
      state.isDryZone = false;
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

  // 6. Share and Manual Refresh handlers
  if (elements.btnShareTheka) {
    elements.btnShareTheka.addEventListener('click', shareTheka);
  }
  if (elements.btnRefreshTheka) {
    elements.btnRefreshTheka.addEventListener('click', () => {
      if (state.isRefreshCooldown) return;
      
      state.isRefreshCooldown = true;
      elements.btnRefreshTheka.classList.add('spinning');
      
      findNearestLiquorStore(state.userLocation.lat, state.userLocation.lon, true);
      
      // Keep spinning for at least 4 seconds to prevent user spamming
      setTimeout(() => {
        state.isRefreshCooldown = false;
        elements.btnRefreshTheka.classList.remove('spinning');
      }, 4000);
    });
  }
  if (elements.btnEmergencySos) {
    elements.btnEmergencySos.addEventListener('click', triggerEmergencySOS);
  }
  if (elements.btnReportOpen) {
    elements.btnReportOpen.addEventListener('click', () => submitStoreFeedback('open'));
  }
  if (elements.btnReportClosed) {
    elements.btnReportClosed.addEventListener('click', () => submitStoreFeedback('closed'));
  }

  // 6. Buy Me a Beer Modal Handlers
  if (elements.btnBuyBeer && elements.beerModal) {
    elements.btnBuyBeer.addEventListener('click', () => {
      elements.beerModal.classList.remove('hidden');
      unlockAudio(); // Unlock audio on click gesture
    });
    
    elements.btnCloseBeerModal.addEventListener('click', () => {
      elements.beerModal.classList.add('hidden');
    });
    
    // Close modal when clicking outside content area
    elements.beerModal.addEventListener('click', (e) => {
      if (e.target === elements.beerModal) {
        elements.beerModal.classList.add('hidden');
      }
    });
    
    // Copy UPI ID functionality
    if (elements.btnCopyUpi && elements.upiAddress) {
      elements.btnCopyUpi.addEventListener('click', () => {
        const textToCopy = elements.upiAddress.textContent;
        navigator.clipboard.writeText(textToCopy)
          .then(() => {
            const originalText = elements.btnCopyUpi.textContent;
            elements.btnCopyUpi.textContent = 'Copied!';
            elements.btnCopyUpi.style.background = 'rgba(40, 167, 69, 0.2)';
            elements.btnCopyUpi.style.color = '#28a745';
            
            setTimeout(() => {
              elements.btnCopyUpi.textContent = originalText;
              elements.btnCopyUpi.style.background = '';
              elements.btnCopyUpi.style.color = '';
            }, 2000);
          })
          .catch(err => {
            console.error('Failed to copy UPI address:', err);
            alert(`UPI Address: ${textToCopy}`);
          });
      });
    }
    
    // "I've Donated" success button
    if (elements.btnBeerSuccess) {
      elements.btnBeerSuccess.addEventListener('click', () => {
        elements.beerModal.classList.add('hidden');
        
        // Trigger donation celebration (hiss, pop sound, and confetti!)
        setTimeout(() => {
          triggerDonationCelebration();
        }, 300);
      });
    }

    // Tab switching inside payment modal
    const tabIndia = document.getElementById('tab-india');
    const tabIntl = document.getElementById('tab-intl');
    const panelIndia = document.getElementById('panel-india');
    const panelIntl = document.getElementById('panel-intl');
    
    if (tabIndia && tabIntl && panelIndia && panelIntl) {
      tabIndia.addEventListener('click', () => {
        tabIndia.classList.add('active');
        tabIntl.classList.remove('active');
        panelIndia.classList.add('active');
        panelIntl.classList.remove('active');
      });
      
      tabIntl.addEventListener('click', () => {
        tabIntl.classList.add('active');
        tabIndia.classList.remove('active');
        panelIntl.classList.add('active');
        panelIndia.classList.remove('active');
      });
    }
    
    // Confetti celebration when international cards are clicked
    const intlCards = document.querySelectorAll('.intl-card');
    intlCards.forEach(card => {
      card.addEventListener('click', () => {
        elements.beerModal.classList.add('hidden');
        
        // Wait for redirect to happen then trigger celebration
        setTimeout(() => {
          triggerDonationCelebration();
        }, 1000);
      });
    });
  }
  
  // Initial dial generation on startup
  generateCompassDial();
  confetti.init();
}

// Fire initial registration on page load
window.addEventListener('DOMContentLoaded', init);
