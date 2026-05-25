const PAGE_COUNTERS = {
  index: { namespace: 'roala-website', key: 'index' },
  bashkohu: { namespace: 'roala-website', key: 'bashkohu' },
  produktet: { namespace: 'roala-website', key: 'produktet' }
};

function formatCountText(pageKey, count) {
  const labels = {
    index: 'Index',
    bashkohu: 'Bashkohu',
    produktet: 'Produktet'
  };
  const label = labels[pageKey] || pageKey;
  return `${label}: ${count.toLocaleString()} visualizzazioni`;
}

function showBadgeIfAllowed() {
  const params = new URLSearchParams(window.location.search);
  const showCounter = params.get('showcounter') === '1';
  if (!showCounter) {
    return false;
  }
  document.querySelectorAll('.page-view-badge').forEach((el) => {
    el.style.display = 'inline-flex';
  });
  return true;
}

function initVisitorCounters() {
  if (!showBadgeIfAllowed()) {
    return;
  }

  document.querySelectorAll('[data-page-key]').forEach((el) => {
    const pageKey = el.dataset.pageKey;
    const config = PAGE_COUNTERS[pageKey];
    if (!config) {
      return;
    }

    el.textContent = 'Caricamento visualizzazioni...';
    fetch(`https://api.countapi.xyz/hit/${encodeURIComponent(config.namespace)}/${encodeURIComponent(config.key)}`)
      .then((response) => response.json())
      .then((data) => {
        if (data && typeof data.value === 'number') {
          el.textContent = formatCountText(pageKey, data.value);
        } else {
          el.textContent = 'Visualizzazioni non disponibili';
        }
      })
      .catch(() => {
        el.textContent = 'Visualizzazioni non disponibili';
      });
  });
}

document.addEventListener('DOMContentLoaded', initVisitorCounters);
