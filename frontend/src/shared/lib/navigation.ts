/** Navegação "dura" (recarrega a página). Isolada aqui para ser mockada nos testes. */
export function hardRedirect(url: string) {
  window.location.assign(url);
}
