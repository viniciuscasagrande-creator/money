/** Teste de integração não destrutivo contra servidor local já iniciado. */
const base = process.env.BASE_URL || "http://localhost:3000";
const email = process.env.TEST_EMAIL || "";
const password = process.env.TEST_PASSWORD || "";
if (!email || !password) { console.error("Defina TEST_EMAIL e TEST_PASSWORD para executar o smoke test."); process.exit(2); }
const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
if (!login.ok) { console.error("Login falhou:", login.status, await login.text()); process.exit(1); }
const cookie = login.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Cookie de sessão não recebido.");
let count = 0;
for (const path of ["/api/dashboard", "/api/recebimentos", "/api/pagamentos", "/api/saldos", "/api/admin/eventos"]) {
  const r = await fetch(`${base}${path}`, { headers: { Cookie: cookie } });
  const body = await r.json();
  if (!r.ok) throw new Error(`${path} falhou (${r.status}): ${JSON.stringify(body)}`);
  console.log(`OK ${r.status} ${path}`); count++;
}
await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
console.log(`Teste de integração: ${count} consultas validadas; nenhuma movimentação criada.`);
