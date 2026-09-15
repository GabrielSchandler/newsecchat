'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { History, Rocket } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { Cartao, CorpoCartao, Selo } from '@/componentes/ui/estrutura';
import { ConteudoDialogo, CorpoDialogo, Dialogo, RodapeDialogo } from '@/componentes/ui/dialogo';
import { formatarDataHora } from '@/lib/utilitarios';
import type { StatusVersaoIa, VersaoAgenteIa } from '@/lib/tipos-banco';
import { publicarVersao, restaurarVersao } from '../acoes';

const TOM_STATUS: Record<StatusVersaoIa, 'sucesso' | 'alerta' | 'neutro'> = {
  PUBLICADA: 'sucesso',
  RASCUNHO: 'alerta',
  EM_REVISAO: 'alerta',
  ARQUIVADA: 'neutro',
};

const ROTULO_STATUS: Record<StatusVersaoIa, string> = {
  PUBLICADA: 'no ar',
  RASCUNHO: 'rascunho',
  EM_REVISAO: 'em revisão',
  ARQUIVADA: 'arquivada',
};

export function ListaVersoes({
  versoes,
  nomes,
  podeEditar,
}: {
  versoes: VersaoAgenteIa[];
  nomes: Record<string, string>;
  podeEditar: boolean;
}) {
  const roteador = useRouter();
  const [vendo, definirVendo] = React.useState<VersaoAgenteIa | null>(null);
  const [ocupado, definirOcupado] = React.useState(false);

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-bruma-600">
        Todo texto que a IA usa é uma versão registrada, com quem criou e quem aprovou. Voltar atrás é
        restaurar uma versão antiga — que vira rascunho e passa pela mesma publicação.
      </p>

      {versoes.map((versao) => (
        <Cartao key={versao.id}>
          <CorpoCartao className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14.5px] font-semibold text-tinta-900">Versão {versao.versao}</span>
                <Selo tom={TOM_STATUS[versao.status]}>{ROTULO_STATUS[versao.status]}</Selo>
                {versao.origem === 'SUGESTAO_IA' ? <Selo tom="ia">veio de sugestão</Selo> : null}
              </div>

              <p className="mt-1 text-[12.5px] text-bruma-600">
                Criada em {formatarDataHora(versao.criado_em)}
                {versao.criado_por ? ` por ${nomes[versao.criado_por] ?? 'alguém'}` : ''}
                {versao.publicado_em
                  ? ` · publicada em ${formatarDataHora(versao.publicado_em)}${
                      versao.aprovado_por ? ` por ${nomes[versao.aprovado_por] ?? 'alguém'}` : ''
                    }`
                  : ''}
              </p>

              {versao.notas_da_versao ? (
                <p className="mt-1 text-[12.5px] italic text-bruma-600">{versao.notas_da_versao}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Botao variante="secundario" tamanho="pequeno" onClick={() => definirVendo(versao)}>
                Ver conteúdo
              </Botao>

              {podeEditar && versao.status === 'RASCUNHO' ? (
                <Botao
                  tamanho="pequeno"
                  disabled={ocupado}
                  onClick={async () => {
                    definirOcupado(true);
                    try {
                      const resultado = await publicarVersao(versao.id);
                      if (!resultado.ok) {
                        toast.error(resultado.erro ?? 'Não foi possível publicar.');
                        return;
                      }
                      if (resultado.aviso) toast.warning(resultado.aviso);
                      else toast.success('Versão publicada.');
                      roteador.refresh();
                    } finally {
                      definirOcupado(false);
                    }
                  }}
                >
                  <Rocket className="h-3.5 w-3.5" aria-hidden />
                  Publicar
                </Botao>
              ) : null}

              {podeEditar && versao.status === 'ARQUIVADA' ? (
                <Botao
                  variante="fantasma"
                  tamanho="pequeno"
                  disabled={ocupado}
                  onClick={async () => {
                    definirOcupado(true);
                    try {
                      const resultado = await restaurarVersao(versao.id);
                      if (!resultado.ok) {
                        toast.error(resultado.erro ?? 'Não foi possível restaurar.');
                        return;
                      }
                      if (resultado.aviso) toast.warning(resultado.aviso);
                      else toast.success('Conteúdo copiado para um rascunho novo. Revise e publique.');
                      roteador.refresh();
                    } finally {
                      definirOcupado(false);
                    }
                  }}
                >
                  <History className="h-3.5 w-3.5" aria-hidden />
                  Restaurar
                </Botao>
              ) : null}
            </div>
          </CorpoCartao>
        </Cartao>
      ))}

      <Dialogo
        open={vendo !== null}
        onOpenChange={(valor) => {
          if (!valor) definirVendo(null);
        }}
      >
        <ConteudoDialogo
          titulo={vendo ? `Versão ${vendo.versao}` : 'Versão'}
          descricao="Conteúdo exatamente como a IA recebe."
          className="max-w-2xl"
        >
          <CorpoDialogo>
            {vendo ? (
              <div className="space-y-3">
                {[
                  ['Persona', vendo.persona],
                  ['Nome de exibição', vendo.nome_exibicao ?? '(sem nome — mensagem sai sem prefixo)'],
                  ['Tom', vendo.tom],
                  ['A empresa', vendo.descricao_empresa],
                  ['Serviços', vendo.servicos],
                  ['Base de conhecimento', vendo.base_conhecimento],
                  ['Objetivos', vendo.objetivos],
                  ['Regras', vendo.regras],
                  ['Limitações', vendo.limitacoes],
                  ['Informações proibidas', vendo.informacoes_proibidas],
                  ['Mensagem ao transferir', vendo.mensagem_fallback],
                ]
                  .filter(([, valor]) => String(valor ?? '').trim())
                  .map(([rotulo, valor]) => (
                    <div key={rotulo}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-bruma-500">
                        {rotulo}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-tinta-800">
                        {valor}
                      </p>
                    </div>
                  ))}
              </div>
            ) : null}
          </CorpoDialogo>

          <RodapeDialogo>
            <Botao variante="secundario" onClick={() => definirVendo(null)}>
              Fechar
            </Botao>
          </RodapeDialogo>
        </ConteudoDialogo>
      </Dialogo>
    </div>
  );
}
