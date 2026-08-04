function openLightbox(src) {
  let overlay = document.getElementById('lightboxOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lightboxOverlay';
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `
      <button class="lightbox-close" aria-label="Close">&times;</button>
      <img class="lightbox-img" id="lightboxImg" src="" alt="" />
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('lightbox-close')) {
        overlay.classList.remove('open');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') overlay.classList.remove('open');
    });
  }
  document.getElementById('lightboxImg').src = src;
  overlay.classList.add('open');
}

function getMyId() {
  let id = localStorage.getItem('askjimmy_myId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('askjimmy_myId', id);
  }
  return id;
}

function getMyName() {
  let name = localStorage.getItem('askjimmy_myName');
  if (!name) {
    name = prompt('Quick demo step: what name should Jimmy use for you? (stands in for SMS verification)') || 'Guest';
    localStorage.setItem('askjimmy_myName', name);
  }
  return name;
}

function formatPostedDate(iso) {
  const posted = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - posted) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Posted today';
  if (diffDays === 1) return 'Posted yesterday';
  if (diffDays < 7) return `Posted ${diffDays} days ago`;

  const opts = { month: 'short', day: 'numeric' };
  if (posted.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return `Posted ${posted.toLocaleDateString(undefined, opts)}`;
}

function calculateFee(price) {
  price = Number(price) || 0;
  if (price === 0) return 0; // free giveaways never owe a fee
  let fee = price < 100 ? price * 0.05 : price * 0.02;
  fee = Math.max(fee, 2); // minimum
  fee = Math.min(fee, 20); // never more than $20
  return Math.round(fee * 100) / 100;
}

function renderHeader(activePage) {
  const header = document.createElement('header');
  header.innerHTML = `
    <a href="/index.html" class="brand"><img src="/jimmy-logo.png" class="brand-logo" alt="Ask Jimmy" /> Ask Jimmy</a>
    <nav>
      <a href="/index.html">Browse</a>
      <a href="/create.html">Sell an item</a>
      <a href="/dashboard.html">My listings</a>
      <a href="/account.html">My Account</a>
      <a href="#" id="helpLink">How fees work</a>
      <a href="#" id="supportLink">Contact / Help</a>
    </nav>
  `;
  document.body.prepend(header);

  const overlay = document.createElement('div');
  overlay.id = 'helpOverlay';
  overlay.className = 'help-overlay';
  overlay.innerHTML = `
    <div class="help-modal">
      <div class="jimmy-panel-header">
        <span>How fees & payment work</span>
        <button id="helpClose" aria-label="Close">&times;</button>
      </div>
      <div class="help-modal-body">
        <p><strong>Listing is always free.</strong> You never pay anything to post an item.</p>
        <p><strong>A fee only applies if it sells:</strong></p>
        <ul>
          <li>5% of the sale price for items under $100</li>
          <li>2% of the sale price for items $100 and up</li>
          <li>$2 minimum, $20 maximum per sale — no matter the price</li>
        </ul>
        <p><strong>When you're charged:</strong> once the buyer confirms they picked up the item, the fee is charged to the payment method on file. If a deal falls through, you're not charged.</p>
        <p><strong>Payment method:</strong> added once when you first create a listing (or before your next one, if you set one up before this was required). This is a prototype — no real card processing happens; nothing is actually charged.</p>
        <p class="security-note">⚠️ <strong>Improper activity related to the sale of goods</strong> — including misrepresenting an item, prohibited items, or attempting to avoid fees owed on a completed sale — will result in cancellation of your account. This is separate from payment issues.</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('helpLink').addEventListener('click', (e) => {
    e.preventDefault();
    overlay.classList.add('open');
  });
  document.getElementById('helpClose').addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });

  const supportOverlay = document.createElement('div');
  supportOverlay.id = 'supportOverlay';
  supportOverlay.className = 'help-overlay';
  supportOverlay.innerHTML = `
    <div class="help-modal">
      <div class="jimmy-panel-header">
        <span>Contact AskJimmy</span>
        <button id="supportClose" aria-label="Close">&times;</button>
      </div>
      <div class="help-modal-body">
        <p class="hint">Having a problem with a listing, a deal, or a billing charge? Send a note and we'll follow up directly.</p>
        <form id="supportForm">
          <label>Your name</label>
          <input type="text" id="supportName" required />
          <label>Email</label>
          <input type="email" id="supportEmail" required />
          <label>What's this about?</label>
          <select id="supportCategory">
            <option>Billing issue</option>
            <option>Problem with a deal</option>
            <option>Technical problem</option>
            <option>Other</option>
          </select>
          <label>Message</label>
          <textarea id="supportMessage" rows="4" required placeholder="Tell us what's going on"></textarea>
          <button type="submit">Send message</button>
        </form>
        <div id="supportConfirmation" style="display:none">
          <p><strong>Thanks — message sent!</strong></p>
          <p class="hint">We'll get back to you by email as soon as we can.</p>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(supportOverlay);

  document.getElementById('supportLink').addEventListener('click', (e) => {
    e.preventDefault();
    supportOverlay.classList.add('open');
  });
  document.getElementById('supportClose').addEventListener('click', () => supportOverlay.classList.remove('open'));
  supportOverlay.addEventListener('click', (e) => {
    if (e.target === supportOverlay) supportOverlay.classList.remove('open');
  });

  document.getElementById('supportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch('/api/support-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('supportName').value,
        email: document.getElementById('supportEmail').value,
        category: document.getElementById('supportCategory').value,
        message: document.getElementById('supportMessage').value,
        userId: getMyId(),
      }),
    });
    if (!res.ok) {
      alert('Please fill in your name, email, and message.');
      return;
    }
    document.getElementById('supportForm').style.display = 'none';
    document.getElementById('supportConfirmation').style.display = 'block';
  });
}

function renderJimmyWidget() {
  if (document.getElementById('jimmyFab')) return;

  const fab = document.createElement('button');
  fab.id = 'jimmyFab';
  fab.className = 'jimmy-fab';
  fab.innerHTML = `<img src="/jimmy-logo.png" class="jimmy-avatar tiny jimmy-fab-avatar" alt="" /> Ask Jimmy`;
  fab.title = 'Ask Jimmy to search listings or answer questions';

  const panel = document.createElement('div');
  panel.id = 'jimmyPanel';
  panel.className = 'jimmy-panel';
  panel.innerHTML = `
    <div class="jimmy-panel-header">
      <span style="display:flex; align-items:center; gap:8px;"><img src="/jimmy-logo.png" class="jimmy-avatar tiny" alt="" /> Ask Jimmy</span>
      <button id="jimmyClose" aria-label="Close">&times;</button>
    </div>
    <div class="jimmy-panel-messages" id="jimmyMessages">
      <div class="jimmy-message-row">
        <img src="/jimmy-logo.png" class="jimmy-avatar small" alt="" />
        <div class="bubble jimmy">Hi! Tell me what you're looking for — e.g. "bike under $300" — and I'll search active listings for you.</div>
      </div>
    </div>
    <div class="jimmy-panel-input-row">
      <input type="text" id="jimmyInput" placeholder="Search or ask a question…" />
      <button id="jimmySend">Send</button>
    </div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  fab.addEventListener('click', () => panel.classList.toggle('open'));
  document.getElementById('jimmyClose').addEventListener('click', () => panel.classList.remove('open'));

  function addMessage(html, sender) {
    const messages = document.getElementById('jimmyMessages');
    if (sender === 'jimmy') {
      const row = document.createElement('div');
      row.className = 'jimmy-message-row';
      row.innerHTML = `<img src="/jimmy-logo.png" class="jimmy-avatar small" alt="" /><div class="bubble jimmy">${html}</div>`;
      messages.appendChild(row);
    } else {
      const div = document.createElement('div');
      div.className = `bubble ${sender}`;
      div.innerHTML = html;
      messages.appendChild(div);
    }
    messages.scrollTop = messages.scrollHeight;
  }

  async function handleSend() {
    const input = document.getElementById('jimmyInput');
    const query = input.value.trim();
    if (!query) return;
    addMessage(query.replace(/</g, '&lt;'), 'buyer');
    input.value = '';

    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const results = await res.json();

    if (results.length === 0) {
      addMessage(`I couldn't find anything matching that. Try <a href="/index.html">browsing all listings</a> instead.`, 'jimmy');
      return;
    }

    const list = results
      .map(
        (r) => `<a class="jimmy-result-card" href="/listing.html?id=${r.id}">
          <strong>${r.title}</strong> — ${Number(r.askingPrice) === 0 ? 'Free' : '$' + r.askingPrice}<br><span style="opacity:0.7">${r.category}${r.location ? ' · ' + r.location : ''}</span>
        </a>`
      )
      .join('');
    addMessage(
      `Here's what I found:<div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">${list}</div>`,
      'jimmy'
    );
  }

  document.getElementById('jimmySend').addEventListener('click', handleSend);
  document.getElementById('jimmyInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSend();
  });
}

function adBoxHTML(label) {
  return `
    <div class="ad-box">
      <p class="ad-box-label">Advertise Here</p>
      <p class="hint">${label || 'Reach local buyers and sellers on AskJimmy.'}</p>
      <button class="small secondary" onclick="openAdModal()">Advertise with us</button>
    </div>
  `;
}

function weatherBoxHTML() {
  return `
    <div class="ad-box weather-box" id="weatherBox">
      <p class="ad-box-label">Local Weather</p>
      <p class="hint">Loading…</p>
    </div>
  `;
}

async function loadWeatherBox() {
  const box = document.getElementById('weatherBox');
  if (!box) return;
  try {
    const res = await fetch('/api/weather');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    box.innerHTML = `
      <p class="ad-box-label">Local Weather</p>
      <div style="font-size:2rem; line-height:1;">${data.icon}</div>
      <p style="font-weight:700; font-size:1.3rem; margin:6px 0 0;">${data.tempC}°C</p>
      <p class="hint" style="margin-bottom:0;">${data.description} · ${data.location}</p>
    `;
  } catch {
    box.innerHTML = `<p class="ad-box-label">Local Weather</p><p class="hint" style="margin-bottom:0;">Unavailable right now.</p>`;
  }
}

function countdownBoxHTML() {
  return `
    <div class="ad-box weather-box" id="countdownBox">
      <p class="ad-box-label">NHL Season Countdown</p>
      <p class="hint">Loading…</p>
    </div>
  `;
}

function loadCountdownBox() {
  const box = document.getElementById('countdownBox');
  if (!box) return;

  const now = new Date();
  let target = new Date(now.getFullYear(), 8, 29); // September 29
  if (target < now) target = new Date(now.getFullYear() + 1, 8, 29);
  const days = Math.ceil((target - now) / (1000 * 60 * 60 * 24));

  box.innerHTML = `
    <p class="ad-box-label">NHL Season Countdown</p>
    <p style="font-weight:700; font-size:1.6rem; margin:6px 0 0;">${days}</p>
    <p class="hint" style="margin-bottom:0;">day${days === 1 ? '' : 's'} until puck drop — Sep 29</p>
  `;
}

function renderAdModal() {
  if (document.getElementById('adOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'adOverlay';
  overlay.className = 'help-overlay';
  overlay.innerHTML = `
    <div class="help-modal">
      <div class="jimmy-panel-header">
        <span>Advertise on AskJimmy</span>
        <button id="adClose" aria-label="Close">&times;</button>
      </div>
      <div class="help-modal-body">
        <p class="hint">Send a quick note and we'll follow up to work out the ad creative (pictures, links) and payment together.</p>
        <form id="adForm">
          <label>Business name</label>
          <input type="text" id="adBusinessName" required />
          <label>Email</label>
          <input type="email" id="adEmail" required />
          <label>Phone (optional)</label>
          <input type="tel" id="adPhone" />
          <label>What would you like to promote?</label>
          <textarea id="adMessage" rows="3"></textarea>
          <button type="submit">Send inquiry</button>
        </form>
        <div id="adConfirmation" style="display:none">
          <p><strong>Thanks — inquiry sent!</strong></p>
          <p class="hint">We'll be in touch to set up pictures, links, and payment.</p>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('adClose').addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });

  document.getElementById('adForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch('/api/ad-inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: document.getElementById('adBusinessName').value,
        email: document.getElementById('adEmail').value,
        phone: document.getElementById('adPhone').value,
        message: document.getElementById('adMessage').value,
      }),
    });
    if (!res.ok) {
      alert('Please fill in your business name and email.');
      return;
    }
    document.getElementById('adForm').style.display = 'none';
    document.getElementById('adConfirmation').style.display = 'block';
  });
}

function openAdModal() {
  document.getElementById('adOverlay').classList.add('open');
}

renderJimmyWidget();
renderAdModal();
