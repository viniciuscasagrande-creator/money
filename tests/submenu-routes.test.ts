import assert from "node:assert/strict";
import test from "node:test";
import { TOTAL_SUBMENUS } from "../src/config/navigation";
import {
  ALL_OPERATIONAL_SUBMENU_ROUTES,
  resolveSubmenuOperationalRoute,
} from "../src/config/submenu-routes";

test("todos os 172 submenus apontam para rotas operacionais reais (sem página genérica /submenus/[id])", () => {
  assert.equal(ALL_OPERATIONAL_SUBMENU_ROUTES.length, TOTAL_SUBMENUS);
  for (const item of ALL_OPERATIONAL_SUBMENU_ROUTES) {
    assert.ok(item.operationalHref.startsWith("/"), `Rota inválida: ${item.operationalHref}`);
    assert.ok(
      !item.operationalHref.startsWith("/submenus"),
      `Submenu ${item.submenuCode} não pode apontar para página genérica /submenus`
    );
    assert.equal(item.status, "OPERACIONAL_HOMOLOGADO");
  }
});

test("mapeamento específico de submenus críticos (Plano de Contas, Orçamento, Cancelamentos, Retenções, Integração)", () => {
  assert.equal(resolveSubmenuOperationalRoute("13.01").operationalHref, "/contabilidade/livros?aba=plano");
  assert.equal(resolveSubmenuOperationalRoute("13.03").operationalHref, "/contabilidade/livros?aba=razao");
  assert.equal(resolveSubmenuOperationalRoute("13.06").operationalHref, "/contabilidade/livros?aba=demonstrativos");
  assert.equal(resolveSubmenuOperationalRoute("13.08").operationalHref, "/contabilidade/livros?aba=regras");
  assert.equal(resolveSubmenuOperationalRoute("13.09").operationalHref, "/contabilidade/livros?aba=demonstrativos");
  assert.equal(resolveSubmenuOperationalRoute("13.10").operationalHref, "/contabilidade");
  assert.equal(resolveSubmenuOperationalRoute("13.13").operationalHref, "/contabilidade/livros?aba=passivos");
  assert.equal(resolveSubmenuOperationalRoute("11.01").operationalHref, "/planejamento");
  assert.equal(resolveSubmenuOperationalRoute("10.01").operationalHref, "/ocorrencias");
  assert.equal(resolveSubmenuOperationalRoute("06.03").operationalHref, "/repasses");
  assert.equal(resolveSubmenuOperationalRoute("06.13").operationalHref, "/retencoes");
  assert.equal(resolveSubmenuOperationalRoute("07.09").operationalHref, "/integracao");
  assert.equal(resolveSubmenuOperationalRoute("17.01").operationalHref, "/cadastros");
});
