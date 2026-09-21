import { GestaoOperacional } from '@/componentes/operacao/gestao';
export const dynamic='force-dynamic';
export default async function Pagina({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <GestaoOperacional modo="equipes" parametros={await searchParams}/>;}
