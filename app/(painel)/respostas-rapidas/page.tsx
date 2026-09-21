import { carregarRespostas } from '@/lib/operacao/dados';
import { exigirSessao } from '@/lib/sessao';
import { carregarApoio } from '../atendimento/dados';
import { EditorRespostas } from './editor';
export const dynamic='force-dynamic';
export default async function Pagina(){const s=await exigirSessao();const [respostas,apoio]=await Promise.all([carregarRespostas(),carregarApoio(s.organizacao.id)]);return <EditorRespostas respostas={respostas} departamentos={apoio.departamentos} membroId={s.membro.id} podeCompartilhar={s.papel!=='ATENDENTE'}/>;}
