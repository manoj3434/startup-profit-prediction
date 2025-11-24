const API_BASE = 'http://localhost:5001'; // ✅ backend running on port 5001

document.getElementById('predict-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const rd = parseFloat(document.getElementById('rd').value);
  const admin = parseFloat(document.getElementById('admin').value);
  const market = parseFloat(document.getElementById('market').value);
  const state = document.getElementById('state').value;

  if (isNaN(rd) || isNaN(admin) || isNaN(market)) {
    alert('Please enter valid numeric values.');
    return;
  }

  const payload = { rd_spend: rd, administration: admin, marketing_spend: market, state };
  showLoading(true);

  try {
    const res = await fetch(`${API_BASE}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Prediction request failed');

    const data = await res.json();

    showResult(data.prediction);
    updateChart(rd + admin + market, data.prediction);

    // ✅ NEW — update history
    updateHistory(
      { rd, admin, market },
      data.prediction
    );

  } catch (err) {
    alert('Error: ' + (err.message || err));
    console.error(err);
  } finally {
    showLoading(false);
  }
});

function showLoading(on) {
  document.getElementById('loading').classList.toggle('hidden', !on);
  document.getElementById('predict-btn').disabled = on;
}

function showResult(value) {
  document.getElementById('profit-value').textContent = '₹ ' + formatNumber(value);
  document.getElementById('result').classList.remove('hidden');
}

function formatNumber(n) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/* ✅ Chart.js — dynamic chart */
const ctx = document.getElementById('profitChart').getContext('2d');
const chart = new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ['Expenses', 'Predicted Profit'],
    datasets: [{
      label: '₹',
      data: [0, 0]
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } }
  }
});

function updateChart(expenses, profit) {
  chart.data.datasets[0].data = [Math.round(expenses), Math.round(profit)];
  chart.update();
}

/* Model importance chart */
let importanceChart = null;
async function loadModelInfo() {
  try {
    const res = await fetch(`${API_BASE}/model-info`);
    if (!res.ok) throw new Error('No model info');
    const meta = await res.json();

    const metaEl = document.getElementById('modelMeta');
    metaEl.innerHTML = `Trained on: <b>${meta.trained_on || 'unknown'}</b><br/>Trained at: <b>${meta.trained_at || 'n/a'}</b><br/>Train R²: <b>${(meta.train_r2||0).toFixed(3)}</b> • Test R²: <b>${(meta.test_r2||0).toFixed(3)}</b>`;

    const importances = meta.importances || {};
    const labels = Object.keys(importances);
    const values = labels.map(k => importances[k]);

    const ctx2 = document.getElementById('importanceChart').getContext('2d');
    if (importanceChart) importanceChart.destroy();
    importanceChart = new Chart(ctx2, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Importance', data: values, backgroundColor: ['#0a84ff','#34c759','#ffcc00','#ff3b30'] }] },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
    });

  } catch (err) {
    console.warn('model-info fetch failed', err);
    document.getElementById('modelMeta').textContent = 'Model info not available.';
  }
}

/* ✅ NEW — prediction history feature */
const historyList = [];

function updateHistory(input, prediction) {
  const entry = { input, prediction, ts: new Date().toISOString() };
  historyList.push(entry);

  const box = document.getElementById('history');
  box.innerHTML = historyList
    .map(item => `
      <div class="history-item">
        ${new Date(item.ts).toLocaleString()} — ₹${item.input.rd} + ₹${item.input.admin} + ₹${item.input.market}
        → <b>₹ ${formatNumber(item.prediction)}</b>
      </div>
    `)
    .join('');

  // If the optional charts were added (in some versions), update them safely.
  try {
    if (typeof historyLabels !== 'undefined' && typeof historyLineChart !== 'undefined' && historyLineChart) {
      // Update charts data arrays (keep recent historyMax entries)
      const ts = new Date(entry.ts).toLocaleTimeString();
      historyLabels.push(ts);
      historyProfits.push(Math.round(entry.prediction));
      historyRds.push(Math.round(entry.input.rd));
      historyAdmins.push(Math.round(entry.input.admin));
      historyMarkets.push(Math.round(entry.input.market));

      while (historyLabels.length > historyMax) {
        historyLabels.shift(); historyProfits.shift(); historyRds.shift(); historyAdmins.shift(); historyMarkets.shift();
      }

      if (historyLineChart && typeof historyLineChart.update === 'function') historyLineChart.update();
    }

    if (typeof componentsChart !== 'undefined' && componentsChart && typeof componentsChart.update === 'function') {
      componentsChart.update();
    }
  } catch (e) {
    // Swallow errors here to avoid breaking the UI when optional charts are not present.
    console.debug('Optional history charts not present or failed to update:', e);
  }
}

function exportHistoryCSV() {
  if (historyList.length === 0) { alert('No history to export'); return; }
  const rows = [['timestamp','rd_spend','administration','marketing_spend','prediction']];
  for (const h of historyList) {
    rows.push([h.ts, h.input.rd, h.input.admin, h.input.market, h.prediction]);
  }
  const csv = rows.map(r => r.map(c => String(c).replace(/"/g,'""')).map(c=>`"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'prediction_history.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('export-history-btn').addEventListener('click', exportHistoryCSV);

/* load model info on startup */
loadModelInfo();

/* Initialize sample */
updateChart(300000, 150000);
