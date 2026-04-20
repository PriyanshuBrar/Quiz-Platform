
const params = new URLSearchParams(window.location.search);
const code = params.get('code');

const codeEl = document.getElementById('codeValue');
const joinLinkEl = document.getElementById('joinLinkValue');
const copyBtn = document.getElementById('copyBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const homeBtn = document.getElementById('homeBtn');
const joinLink = code ? `${window.location.origin}/join.html?code=${encodeURIComponent(code)}` : '';


if (codeEl) {
  codeEl.value = code;
}
if (joinLinkEl) {
  joinLinkEl.value = joinLink;
}

function flashButton(btn) {
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => { btn.textContent = orig; }, 2000);
}

if (copyBtn) {
  copyBtn.addEventListener('click', () => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => flashButton(copyBtn));
  });
}

if (copyLinkBtn) {
  copyLinkBtn.addEventListener('click', () => {
    if (!joinLink) return;
    navigator.clipboard.writeText(joinLink).then(() => flashButton(copyLinkBtn));
  });
}

if (homeBtn) {
  homeBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
}
