import { redirect } from 'next/navigation';

/**
 * A raiz não tem conteúdo próprio: quem entra vai direto para a central.
 * O middleware já cuidou de mandar quem não tem sessão para o login.
 */
export default function PaginaInicial() {
  redirect('/atendimento');
}
