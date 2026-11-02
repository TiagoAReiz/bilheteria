// Uso: node scripts/load-test.mjs [baseUrl]   (a API precisa estar rodando)
const BASE = process.argv[2] ?? 'http://localhost:3000';
const ROUNDS = [10, 100, 1000, 10000];
const CONCURRENCY = 200;
const EVENT_ID = 1;

// prefixo aleatorio: CPFs de execucoes anteriores continuam no banco e bateriam no limite por CPF
const runPrefix = String(Math.floor(Math.random() * 1e4)).padStart(4, '0');
let cpfSeq = 0;
const nextCpf = () => runPrefix + String(++cpfSeq).padStart(7, '0');

async function reservar() {
  try {
    const res = await fetch(`${BASE}/reservation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf: nextCpf(), event_id: EVENT_ID }),
    });
    await res.arrayBuffer();
    return res.status;
  } catch {
    return 'network-error';
  }
}

async function round(n) {
  const counts = {};
  let sent = 0;
  const started = performance.now();

  const worker = async () => {
    while (sent < n) {
      sent++;
      const status = await reservar();
      counts[status] = (counts[status] ?? 0) + 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, n) }, worker));

  const secs = (performance.now() - started) / 1000;
  console.log(`\n== ${n} requests em ${secs.toFixed(2)}s (${(n / secs).toFixed(0)} req/s)`);
  console.log('   status:', counts);
  return counts;
}

async function getStatus() {
  const res = await fetch(`${BASE}/status/${EVENT_ID}`);
  return res.json();
}

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(ok);
  console.log(`   ${ok ? 'OK  ' : 'FAIL'} ${name} ${detail}`);
};

const before = await getStatus();
console.log('status inicial:', before);
if (before.available === 0) {
  console.log('Nenhum ingresso disponivel para o evento; reinicie a API/seed antes de rodar.');
  process.exit(1);
}

let accepted = 0;
for (const n of ROUNDS) {
  const counts = await round(n);
  accepted += (counts[201] ?? 0) + (counts[200] ?? 0);
  check('sem erro 5xx/rede', !Object.keys(counts).some((s) => s === 'network-error' || s.startsWith('5')), JSON.stringify(counts));
}

const after = await getStatus();
console.log('\nstatus final:', after);
check('total constante', after.total === before.total, `(${after.total})`);
check('available + reserved = total', after.available + after.reserved === after.total);
check('nunca reserva acima da capacidade', after.reserved <= after.total, `(${after.reserved}/${after.total})`);
check('reservas novas <= disponiveis no inicio', after.reserved - before.reserved <= before.available, `(${after.reserved - before.reserved}/${before.available})`);
check('reservas aceitas = reserved (sem overbooking)', accepted === after.reserved - before.reserved, `(aceitas=${accepted}, delta=${after.reserved - before.reserved})`);

process.exit(checks.every(Boolean) ? 0 : 1);
