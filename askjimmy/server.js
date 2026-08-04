const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = 3210;
const DATA_FILE = path.join(__dirname, 'data', 'listings.json');
const SELLERS_FILE = path.join(__dirname, 'data', 'sellers.json');
const SEARCHES_FILE = path.join(__dirname, 'data', 'searches.json');
const AD_INQUIRIES_FILE = path.join(__dirname, 'data', 'adInquiries.json');
const SUPPORT_REQUESTS_FILE = path.join(__dirname, 'data', 'supportRequests.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- storage ----------

function loadListings() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveListings(listings) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(listings, null, 2));
}

function loadSellers() {
  if (!fs.existsSync(SELLERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(SELLERS_FILE, 'utf8'));
}

function saveSellers(sellers) {
  fs.writeFileSync(SELLERS_FILE, JSON.stringify(sellers, null, 2));
}

function loadSearches() {
  if (!fs.existsSync(SEARCHES_FILE)) return {};
  return JSON.parse(fs.readFileSync(SEARCHES_FILE, 'utf8'));
}

function saveSearches(searches) {
  fs.writeFileSync(SEARCHES_FILE, JSON.stringify(searches, null, 2));
}

function loadAdInquiries() {
  if (!fs.existsSync(AD_INQUIRIES_FILE)) return [];
  return JSON.parse(fs.readFileSync(AD_INQUIRIES_FILE, 'utf8'));
}

function saveAdInquiries(inquiries) {
  fs.writeFileSync(AD_INQUIRIES_FILE, JSON.stringify(inquiries, null, 2));
}

function loadSupportRequests() {
  if (!fs.existsSync(SUPPORT_REQUESTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(SUPPORT_REQUESTS_FILE, 'utf8'));
}

function saveSupportRequests(requests) {
  fs.writeFileSync(SUPPORT_REQUESTS_FILE, JSON.stringify(requests, null, 2));
}

function publicListing(listing, viewerId) {
  const isOwner = viewerId && viewerId === listing.sellerId;
  const { conversations, floorPrice, ...rest } = listing;
  const out = { ...rest };
  if (isOwner) {
    out.floorPrice = floorPrice;
    out.conversations = conversations;
  }
  return out;
}

// ---------- content moderation ----------
// NOTE: text-based keyword matching only. There is no image-content scanning
// here — photo uploads are not analyzed for explicit material.

const MODERATION_FILE = path.join(__dirname, 'data', 'moderation.json');

function loadModeration() {
  if (!fs.existsSync(MODERATION_FILE)) return {};
  return JSON.parse(fs.readFileSync(MODERATION_FILE, 'utf8'));
}

function saveModeration(moderation) {
  fs.writeFileSync(MODERATION_FILE, JSON.stringify(moderation, null, 2));
}

function isUserBlocked(userId) {
  const moderation = loadModeration();
  return !!(moderation[userId] && moderation[userId].blocked);
}

// Records a messaging violation for a user. First offense is a warning;
// the second blocks the account from sending further messages.
function recordMessagingViolation(userId) {
  const moderation = loadModeration();
  const record = moderation[userId] || { warnings: 0, blocked: false };
  record.warnings += 1;
  if (record.warnings >= 2) record.blocked = true;
  moderation[userId] = record;
  saveModeration(moderation);
  return { blocked: record.blocked, warnings: record.warnings };
}

const PROFANITY_TERMS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'piss',
  'slut', 'whore', 'faggot', 'nigger', 'retard',
];

const PROHIBITED_LISTING_TERMS = [
  // weapons
  'gun', 'firearm', 'pistol', 'handgun', 'rifle', 'shotgun', 'ammo',
  'ammunition', 'bullet', 'grenade', 'explosive', 'bomb', 'silencer',
  // drugs
  'cocaine', 'heroin', 'meth', 'methamphetamine', 'fentanyl', 'crack',
  'ecstasy', 'mdma', 'lsd',
  // explicit material
  'porn', 'pornography', 'nudes', 'escort', 'sex tape', 'onlyfans',
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findBannedTerm(text, list) {
  if (!text) return null;
  return list.find((term) => new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(text)) || null;
}

function moderateListingText(...fields) {
  const combined = fields.filter(Boolean).join(' ');
  return findBannedTerm(combined, [...PROHIBITED_LISTING_TERMS, ...PROFANITY_TERMS]);
}

// ---------- Jimmy's scripted negotiation brain ----------
// NOTE: this is a stand-in rules engine for the prototype. It gets replaced
// with a real Claude-powered agent once an Anthropic API key is wired in.

function extractOfferAmount(text) {
  const match = text.replace(/,/g, '').match(/\$?\s?(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  return Math.round(parseFloat(match[1]));
}

function uniqueBuyerCount(listing) {
  return Object.keys(listing.conversations || {}).length;
}

function firmnessFactor(listing) {
  // more unique inquirers => Jimmy concedes less per round
  const n = uniqueBuyerCount(listing);
  return Math.min(0.08 * n, 0.42); // caps so Jimmy always concedes a little
}

function jimmyReply(listing, convo, incomingText) {
  const asking = listing.askingPrice;
  const floor = listing.floorPrice;
  const offer = extractOfferAmount(incomingText);

  if (convo.jimmyCurrentAsk == null) convo.jimmyCurrentAsk = asking;

  if (offer == null) {
    // no numeric offer detected - answer from the listing's checklist, or prompt for an offer
    const lower = incomingText.toLowerCase();
    const checklist = listing.checklist || {};
    for (const [key, value] of Object.entries(checklist)) {
      if (lower.includes(key.toLowerCase())) {
        return {
          text: `${key}: ${value}. Anything else you'd like to know, or would you like to make an offer? Asking price is $${asking}.`,
          status: convo.status,
        };
      }
    }
    return {
      text: `Happy to answer questions about the ${listing.title}. Quick summary: ${listing.description} It's listed at $${asking}. What would you like to offer?`,
      status: convo.status,
    };
  }

  if (offer >= convo.jimmyCurrentAsk) {
    convo.status = 'agreed_pending_buyer_confirm';
    convo.agreedPrice = convo.jimmyCurrentAsk;
    return {
      text: `Deal — $${convo.agreedPrice} works. Tap "Confirm deal" below to lock it in and pick a pickup time.`,
      status: convo.status,
    };
  }

  if (offer < floor) {
    return {
      text: `Thanks for the offer, but that's a bit too low for the ${listing.title} — I'm firm around $${convo.jimmyCurrentAsk}. Happy to keep talking if you can come up.`,
      status: convo.status,
    };
  }

  // counter-offer: move partway from Jimmy's current ask toward the buyer's offer,
  // but slower as firmness (interest volume) rises. Acceptance only ever happens
  // via the offer >= jimmyCurrentAsk check above — so even if the buyer names the
  // floor outright, Jimmy states it as a counter first. Only once the buyer's next
  // message matches that stated counter does it actually close, never in the same
  // turn the floor was first mentioned.
  const concessionRate = Math.max(0.5 - firmnessFactor(listing), 0.12);
  let counter = convo.jimmyCurrentAsk - (convo.jimmyCurrentAsk - offer) * concessionRate;
  counter = Math.round(counter);
  counter = Math.min(counter, convo.jimmyCurrentAsk - 1); // always concede at least $1, never stall
  counter = Math.max(counter, floor);

  convo.jimmyCurrentAsk = counter;
  return {
    text: `I can come down to $${counter}. That's a solid price for the ${listing.title} given the interest it's getting.`,
    status: convo.status,
  };
}

// ---------- search (stand-in for the front-door Jimmy concierge) ----------

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);

  const searches = loadSearches();
  searches[q] = (searches[q] || 0) + 1;
  saveSearches(searches);

  const words = q.split(/\s+/).filter(Boolean);
  const priceWords = words
    .filter((w) => /^\$?\d+(\.\d+)?$/.test(w))
    .map((w) => parseFloat(w.replace('$', '')));
  const hasMaxIntent = /under|below|less than|cheaper than/.test(q) && priceWords.length > 0;
  const maxPrice = hasMaxIntent ? Math.min(...priceWords) : null;

  const listings = loadListings().filter((l) => l.status === 'active');

  const scored = listings.map((listing) => {
    const haystack = [
      listing.title,
      listing.description,
      listing.category,
      listing.location,
      ...Object.entries(listing.checklist || {}).flat(),
      ...(listing.pickupOptions || []),
    ]
      .join(' ')
      .toLowerCase();

    let score = 0;
    for (const w of words) {
      if (haystack.includes(w)) score += 1;
    }
    if (maxPrice != null) {
      if (listing.askingPrice <= maxPrice) score += 2;
      else score -= 5;
    }
    return { listing, score };
  });

  const results = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => ({
      id: s.listing.id,
      title: s.listing.title,
      category: s.listing.category,
      location: s.listing.location || '',
      askingPrice: s.listing.askingPrice,
      photos: s.listing.photos || [],
    }));

  res.json(results);
});

app.get('/api/popular-searches', (req, res) => {
  const limit = Number(req.query.limit) || 6;
  const searches = loadSearches();

  const top = Object.entries(searches)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([query, count]) => ({ query, count }));

  if (top.length > 0) return res.json(top);

  // cold start: no search history yet, fall back to categories currently in use
  const categories = [...new Set(loadListings().filter((l) => l.status === 'active').map((l) => l.category))].slice(0, limit);
  res.json(categories.map((query) => ({ query, count: 0 })));
});

// ---------- API ----------

app.get('/api/sellers/:id', (req, res) => {
  const sellers = loadSellers();
  const profile = sellers[req.params.id];
  if (!profile) return res.status(404).json({ error: 'Not found' });
  res.json(profile);
});

app.post('/api/sellers', (req, res) => {
  const { sellerId, name, phone, pickupAddress } = req.body;
  if (!sellerId || !name || !phone) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const sellers = loadSellers();
  const existing = sellers[sellerId] || {};
  sellers[sellerId] = { ...existing, name, phone, pickupAddress: pickupAddress || '' };
  saveSellers(sellers);
  res.json(sellers[sellerId]);
});

app.post('/api/sellers/:id/payment-method', (req, res) => {
  const { cardNumber, expiry, postalCode } = req.body;
  const digits = (cardNumber || '').replace(/\D/g, '');
  if (digits.length < 12 || !expiry || !postalCode) {
    return res.status(400).json({ error: 'Enter a valid card number, expiry, and postal/zip code' });
  }
  const sellers = loadSellers();
  if (!sellers[req.params.id]) return res.status(404).json({ error: 'Complete your profile first' });

  sellers[req.params.id].paymentLast4 = digits.slice(-4);
  sellers[req.params.id].paymentExpiry = expiry;
  sellers[req.params.id].paymentPostalCode = postalCode.toUpperCase();
  saveSellers(sellers);
  res.json(sellers[req.params.id]);
});

app.post('/api/ad-inquiries', (req, res) => {
  const { businessName, email, phone, message } = req.body;
  if (!businessName || !email) {
    return res.status(400).json({ error: 'Business name and email are required' });
  }

  const inquiries = loadAdInquiries();
  const inquiry = {
    id: crypto.randomUUID(),
    businessName,
    email,
    phone: phone || '',
    message: message || '',
    createdAt: new Date().toISOString(),
  };
  inquiries.push(inquiry);
  saveAdInquiries(inquiries);
  res.json({ status: 'received' });
});

app.post('/api/support-requests', (req, res) => {
  const { name, email, category, message, userId } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required' });
  }

  const requests = loadSupportRequests();
  const request = {
    id: crypto.randomUUID(),
    name,
    email,
    category: category || 'Other',
    message,
    userId: userId || '',
    createdAt: new Date().toISOString(),
  };
  requests.push(request);
  saveSupportRequests(requests);
  res.json({ status: 'received' });
});

// NOTE: unauthenticated — fine for solo prototype testing, but a real deploy
// needs an actual admin login before these are reachable.
app.get('/api/support-requests', (req, res) => {
  res.json(loadSupportRequests());
});

app.get('/api/ad-inquiries', (req, res) => {
  res.json(loadAdInquiries());
});

app.get('/api/listings', (req, res) => {
  const listings = loadListings();
  const viewerId = req.query.viewerId;
  res.json(listings.map((l) => publicListing(l, viewerId)));
});

app.post('/api/listings', upload.array('photos', 8), (req, res) => {
  const listings = loadListings();
  const { sellerId, title, description, category, askingPrice, floorPrice, location } = req.body;
  let checklist = {};
  let pickupOptions = [];
  try {
    if (req.body.checklist) checklist = JSON.parse(req.body.checklist);
    if (req.body.pickupOptions) pickupOptions = JSON.parse(req.body.pickupOptions);
  } catch {
    return res.status(400).json({ error: 'Invalid checklist or pickupOptions' });
  }

  if (!sellerId || !title || askingPrice === undefined || askingPrice === '' || floorPrice === undefined || floorPrice === '') {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (Number(floorPrice) > Number(askingPrice)) {
    return res.status(400).json({ error: 'Floor price cannot be higher than asking price' });
  }

  if (isUserBlocked(sellerId)) {
    for (const f of req.files || []) fs.unlink(path.join(UPLOADS_DIR, f.filename), () => {});
    return res.status(403).json({ error: 'Your account has been blocked for repeated policy violations and can no longer post listings.' });
  }

  const flaggedTerm = moderateListingText(title, description, ...Object.values(checklist || {}));
  if (flaggedTerm) {
    for (const f of req.files || []) fs.unlink(path.join(UPLOADS_DIR, f.filename), () => {});
    return res.status(400).json({ error: "This listing can't be posted — it appears to contain a prohibited item, explicit content, or inappropriate language. Please revise and try again." });
  }

  const photos = (req.files || []).map((f) => `/uploads/${f.filename}`);

  const listing = {
    id: crypto.randomUUID(),
    sellerId,
    title,
    description: description || '',
    category: category || 'General',
    location: location || '',
    checklist,
    photos,
    askingPrice: Number(askingPrice),
    floorPrice: Number(floorPrice),
    pickupOptions,
    status: 'active',
    createdAt: new Date().toISOString(),
    conversations: {},
  };

  listings.push(listing);
  saveListings(listings);
  res.json(publicListing(listing, sellerId));
});

app.patch('/api/listings/:id', upload.array('photos', 8), (req, res) => {
  const listings = loadListings();
  const listing = listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });

  const { sellerId, title, description, category, askingPrice, floorPrice, location } = req.body;
  if (sellerId !== listing.sellerId) {
    return res.status(403).json({ error: 'Only the seller can edit this listing' });
  }

  let checklist = listing.checklist;
  let pickupOptions = listing.pickupOptions;
  try {
    if (req.body.checklist) checklist = JSON.parse(req.body.checklist);
    if (req.body.pickupOptions) pickupOptions = JSON.parse(req.body.pickupOptions);
  } catch {
    return res.status(400).json({ error: 'Invalid checklist or pickupOptions' });
  }

  if (!title || askingPrice === undefined || askingPrice === '' || floorPrice === undefined || floorPrice === '') {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (Number(floorPrice) > Number(askingPrice)) {
    return res.status(400).json({ error: 'Floor price cannot be higher than asking price' });
  }

  if (isUserBlocked(sellerId)) {
    for (const f of req.files || []) fs.unlink(path.join(UPLOADS_DIR, f.filename), () => {});
    return res.status(403).json({ error: 'Your account has been blocked for repeated policy violations and can no longer edit listings.' });
  }

  const flaggedTerm = moderateListingText(title, description, ...Object.values(checklist || {}));
  if (flaggedTerm) {
    for (const f of req.files || []) fs.unlink(path.join(UPLOADS_DIR, f.filename), () => {});
    return res.status(400).json({ error: "This listing can't be saved — it appears to contain a prohibited item, explicit content, or inappropriate language. Please revise and try again." });
  }

  const newPhotos = (req.files || []).map((f) => `/uploads/${f.filename}`);
  const combinedPhotos = [...(listing.photos || []), ...newPhotos];
  const cappedPhotos = combinedPhotos.slice(0, 8);
  // clean up any newly uploaded files that got cut off by the 8-photo cap
  for (const dropped of combinedPhotos.slice(8)) {
    fs.unlink(path.join(__dirname, 'public', dropped), () => {});
  }

  listing.title = title;
  listing.description = description || '';
  listing.category = category || listing.category;
  listing.location = location || '';
  listing.checklist = checklist;
  listing.askingPrice = Number(askingPrice);
  listing.floorPrice = Number(floorPrice);
  listing.pickupOptions = pickupOptions;
  listing.photos = cappedPhotos;

  saveListings(listings);
  res.json(publicListing(listing, sellerId));
});

app.get('/api/listings/:id', (req, res) => {
  const listings = loadListings();
  const listing = listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });

  const viewerId = req.query.viewerId;
  const out = publicListing(listing, viewerId);
  if (viewerId && viewerId !== listing.sellerId && listing.conversations[viewerId]) {
    out.myConversation = listing.conversations[viewerId];
  }
  res.json(out);
});

app.get('/api/listings/:id/related', (req, res) => {
  const listings = loadListings();
  const listing = listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });

  const limit = Number(req.query.limit) || 4;
  const titleWords = listing.title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  const candidates = listings
    // same category only — never show a vehicle as "related" to a bike, etc.
    .filter((l) => l.id !== listing.id && l.status === 'active' && l.category === listing.category)
    .map((l) => {
      let score = 0;
      if (l.location && listing.location && l.location === listing.location) score += 1;
      const haystack = l.title.toLowerCase();
      for (const w of titleWords) {
        if (haystack.includes(w)) score += 1;
      }
      return { listing: l, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      id: s.listing.id,
      title: s.listing.title,
      category: s.listing.category,
      location: s.listing.location || '',
      askingPrice: s.listing.askingPrice,
      photos: s.listing.photos || [],
    }));

  res.json(candidates);
});

app.post('/api/listings/:id/chat', (req, res) => {
  const listings = loadListings();
  const listing = listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });

  const { buyerId, buyerName, message } = req.body;
  if (!buyerId || !message) return res.status(400).json({ error: 'Missing buyerId or message' });

  if (isUserBlocked(buyerId)) {
    return res.status(403).json({ error: 'Your account has been blocked for repeated policy violations and can no longer send messages.' });
  }

  if (listing.status !== 'active') {
    return res.json({
      messages: [{ sender: 'jimmy', text: 'This item is no longer available — sorry!' }],
      status: 'closed',
    });
  }

  if (!listing.conversations[buyerId]) {
    listing.conversations[buyerId] = {
      buyerName: buyerName || 'Buyer',
      messages: [],
      status: 'negotiating',
      jimmyCurrentAsk: listing.askingPrice,
    };
  }
  const convo = listing.conversations[buyerId];

  // sending a new message while a price is just sitting there awaiting buyer
  // confirmation means they want to keep negotiating instead — un-pause it
  if (convo.status === 'agreed_pending_buyer_confirm') {
    convo.status = 'negotiating';
    convo.agreedPrice = null;
  }

  // if another buyer already has a deal pending seller approval, hold this one gently
  const someoneElseIsClosing = Object.entries(listing.conversations).some(
    ([id, c]) => id !== buyerId && c.status === 'agreed_pending_seller'
  );

  convo.messages.push({ sender: 'buyer', text: message, ts: Date.now() });

  const badWord = findBannedTerm(message, PROFANITY_TERMS);
  if (badWord) {
    const { blocked } = recordMessagingViolation(buyerId);
    const warningText = blocked
      ? 'Your account has been blocked due to repeated use of inappropriate language. You can no longer send messages on AskJimmy.'
      : "Let's keep this respectful — please avoid inappropriate language. One more violation will result in your account being blocked.";
    convo.messages.push({ sender: 'jimmy', text: warningText, ts: Date.now() });
    saveListings(listings);
    return res.json({ messages: convo.messages, status: convo.status, agreedPrice: convo.agreedPrice, blocked });
  }

  let reply;
  if (someoneElseIsClosing && convo.status === 'negotiating') {
    reply = {
      text: `Another buyer is finalizing this one with the seller right now. I'll let you know right away if it opens back up — want to leave your best offer in the meantime?`,
      status: convo.status,
    };
  } else {
    reply = jimmyReply(listing, convo, message);
  }

  convo.messages.push({ sender: 'jimmy', text: reply.text, ts: Date.now() });
  convo.status = reply.status;

  saveListings(listings);
  res.json({ messages: convo.messages, status: convo.status, agreedPrice: convo.agreedPrice });
});

app.post('/api/listings/:id/confirm', (req, res) => {
  const listings = loadListings();
  const listing = listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });

  const { buyerId } = req.body;
  const convo = listing.conversations[buyerId];
  if (!convo || convo.status !== 'agreed_pending_buyer_confirm') {
    return res.status(400).json({ error: 'No pending agreement to confirm' });
  }

  convo.status = 'agreed_pending_seller';
  convo.messages.push({
    sender: 'jimmy',
    text: `Great, I've sent this over to the seller to finalize — I'll let you know as soon as it's confirmed.`,
    ts: Date.now(),
  });
  saveListings(listings);
  res.json({ status: convo.status });
});

app.post('/api/listings/:id/cancel-agreement', (req, res) => {
  const listings = loadListings();
  const listing = listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });

  const { buyerId } = req.body;
  const convo = listing.conversations[buyerId];
  if (!convo || convo.status !== 'agreed_pending_buyer_confirm') {
    return res.status(400).json({ error: 'No pending agreement to cancel' });
  }

  convo.status = 'negotiating';
  convo.agreedPrice = null;
  convo.messages.push({
    sender: 'jimmy',
    text: `No problem — that offer's off the table. Happy to keep talking whenever you're ready.`,
    ts: Date.now(),
  });
  saveListings(listings);
  res.json({ status: convo.status });
});

app.get('/api/dashboard', (req, res) => {
  const listings = loadListings();
  const sellerId = req.query.sellerId;
  const mine = listings
    .filter((l) => l.sellerId === sellerId)
    .map((l) => {
      const conversations = Object.entries(l.conversations || {});
      const uniqueBuyers = conversations.length;
      const pending = conversations
        .filter(([, c]) => c.status === 'agreed_pending_seller')
        .sort((a, b) => (b[1].agreedPrice || 0) - (a[1].agreedPrice || 0))[0];
      return {
        id: l.id,
        title: l.title,
        category: l.category,
        location: l.location || '',
        photos: l.photos || [],
        createdAt: l.createdAt,
        askingPrice: l.askingPrice,
        floorPrice: l.floorPrice,
        status: l.status,
        uniqueBuyers,
        pendingOffer: pending
          ? { buyerId: pending[0], buyerName: pending[1].buyerName, price: pending[1].agreedPrice }
          : null,
        pickupOptions: l.pickupOptions,
      };
    });
  res.json(mine);
});

app.post('/api/listings/:id/approve', (req, res) => {
  const listings = loadListings();
  const listing = listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });

  const { buyerId, pickupChoice } = req.body;
  const convo = listing.conversations[buyerId];
  if (!convo || convo.status !== 'agreed_pending_seller') {
    return res.status(400).json({ error: 'No pending offer to approve' });
  }

  convo.status = 'confirmed';
  convo.pickupChoice = pickupChoice;
  convo.messages.push({
    sender: 'jimmy',
    text: `Confirmed! $${convo.agreedPrice} — pickup: ${pickupChoice}. See you then!`,
    ts: Date.now(),
  });
  listing.status = 'sold';

  for (const [id, c] of Object.entries(listing.conversations)) {
    if (id !== buyerId && c.status !== 'confirmed') {
      c.status = 'closed_lost';
      c.messages.push({
        sender: 'jimmy',
        text: `Thanks for the interest — this item just sold to another buyer. I'll keep you in mind if the seller lists something similar.`,
        ts: Date.now(),
      });
    }
  }

  saveListings(listings);
  res.json({ status: 'sold' });
});

app.post('/api/listings/:id/decline', (req, res) => {
  const listings = loadListings();
  const listing = listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });

  const { buyerId } = req.body;
  const convo = listing.conversations[buyerId];
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });

  convo.status = 'negotiating';
  convo.jimmyCurrentAsk = convo.agreedPrice;
  convo.agreedPrice = null;
  convo.messages.push({
    sender: 'jimmy',
    text: `The seller wants to hold off on that price. Want to try a different offer?`,
    ts: Date.now(),
  });

  saveListings(listings);
  res.json({ status: 'reopened' });
});

app.delete('/api/listings/:id', (req, res) => {
  const listings = loadListings();
  const listing = listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });

  const sellerId = req.query.sellerId || (req.body && req.body.sellerId);
  if (listing.sellerId !== sellerId) {
    return res.status(403).json({ error: 'Only the seller can delete this listing' });
  }

  for (const photo of listing.photos || []) {
    const filePath = path.join(__dirname, 'public', photo);
    fs.unlink(filePath, () => {});
  }

  const remaining = listings.filter((l) => l.id !== req.params.id);
  saveListings(remaining);
  res.json({ status: 'deleted' });
});

// ---------- local weather (Halifax, NS) — free, no-key Open-Meteo API ----------

let weatherCache = { data: null, fetchedAt: 0 };
const WEATHER_CACHE_MS = 30 * 60 * 1000;

function describeWeather(code) {
  const map = {
    0: ['Clear sky', '☀️'],
    1: ['Mostly clear', '🌤️'],
    2: ['Partly cloudy', '⛅'],
    3: ['Overcast', '☁️'],
    45: ['Foggy', '🌫️'],
    48: ['Foggy', '🌫️'],
    51: ['Light drizzle', '🌦️'],
    53: ['Drizzle', '🌦️'],
    55: ['Heavy drizzle', '🌧️'],
    61: ['Light rain', '🌧️'],
    63: ['Rain', '🌧️'],
    65: ['Heavy rain', '🌧️'],
    71: ['Light snow', '🌨️'],
    73: ['Snow', '🌨️'],
    75: ['Heavy snow', '❄️'],
    80: ['Rain showers', '🌦️'],
    81: ['Rain showers', '🌦️'],
    82: ['Violent showers', '⛈️'],
    95: ['Thunderstorm', '⛈️'],
  };
  return map[code] || ['Unsettled', '🌡️'];
}

app.get('/api/weather', async (req, res) => {
  const now = Date.now();
  if (weatherCache.data && now - weatherCache.fetchedAt < WEATHER_CACHE_MS) {
    return res.json(weatherCache.data);
  }
  try {
    const resp = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=44.6488&longitude=-63.5752&current=temperature_2m,weather_code&temperature_unit=celsius&timezone=America%2FHalifax'
    );
    const json = await resp.json();
    const [description, icon] = describeWeather(json.current.weather_code);
    const data = {
      location: 'Halifax, NS',
      tempC: Math.round(json.current.temperature_2m),
      description,
      icon,
    };
    weatherCache = { data, fetchedAt: now };
    res.json(data);
  } catch (err) {
    console.error('Weather fetch failed:', err);
    res.status(502).json({ error: 'Weather unavailable right now' });
  }
});

app.listen(PORT, () => {
  console.log(`AskJimmy prototype running at http://localhost:${PORT}`);
});
