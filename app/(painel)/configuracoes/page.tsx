import type { Metadata } from 'next';
import { exigirPapel } from '@/lib/sessao';
import { integracaoConfigurada } from '@/lib/ambiente';
import { modoFila } from '@/lib/filas/produtor';
import {
  Cartao,
  CabecalhoCartao,
  CorpoCartao,
  DescricaoCartao,
  Selo,
  TituloCartao,
} from '@/componentes/ui/estrutura';
import { FormularioOrganizacao } from './formulario-organizacao';

export const metadata: Metadata = { title: 'Organização' };
export const dynamic = 'force-dynamic';

export default async function PaginaOrganizacao() {
  const sessao = await exigirPapel('ADMIN');

  const situacao = [
    { nome: 'Banco de dados (Supabase)', pronto: true, detalhe: 'Conectado — você está lendo dados dele.' },
    {
      nome: 'Fila de processamento',
      pronto: modoFila() !== 'MEMORIA',
      detalhe:
        modoFila() === 'REDIS'
          ? 'Conectada diretamente ao Redis.'
          : modoFila() === 'MEMORIA'
            ? 'Rodando em memória — só vale para desenvolvimento.'
            : 'A cargo do worker, no servidor à parte: a aplicação grava o trabalho no banco e ele o busca em poucos segundos. Se as mensagens pararem de ser respondidas, confira se o worker está ligado.',
    },
    {
      nome: 'WhatsApp (Evolution API)',
      pronto: integracaoConfigurada('EVOLUTION'),
      detalhe: integracaoConfigurada('EVOLUTION')
        ? 'Configurada.'
        : 'Não configurada. Nenhum número real pode ser conectado.',
    },
    {
      nome: 'Inteligência artificial',
      pronto: integracaoConfigurada('IA'),
      detalhe: integracaoConfigurada('IA')
        ? 'Configurada.'
        : 'Não configurada. As conversas vão direto para atendimento humano.',
    },
    {
      nome: 'Google Sheets',
      pronto: integracaoConfigurada('GOOGLE_SHEETS'),
      detalhe: integracaoConfigurada('GOOGLE_SHEETS')
        ? 'Configurado.'
        : 'Não configurado. A importação de planilhas fica indisponível.',
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <FormularioOrganizacao organizacao={sessao.organizacao} />

      <Cartao className="h-fit">
        <CabecalhoCartao>
          <TituloCartao>Situação do sistema</TituloCartao>
          <DescricaoCartao>
            O que já está ligado e o que ainda depende de configuração. O passo a passo de cada item está
            no arquivo OWNER_SETUP_GUIDE.md.
          </DescricaoCartao>
        </CabecalhoCartao>
        <CorpoCartao>
          <ul className="space-y-3">
            {situacao.map((item) => (
              <li key={item.nome}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-medium text-tinta-900">{item.nome}</span>
                  <Selo tom={item.pronto ? 'sucesso' : 'alerta'}>
                    {item.pronto ? 'pronto' : 'pendente'}
                  </Selo>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-bruma-600">{item.detalhe}</p>
              </li>
            ))}
          </ul>
        </CorpoCartao>
      </Cartao>
    </div>
  );
}
