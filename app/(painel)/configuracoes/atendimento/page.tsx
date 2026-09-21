import { carregarRegra } from '@/lib/operacao/dados';
import { EditorRegras } from './editor';
export default async function Pagina(){return <EditorRegras regra={await carregarRegra()}/>;}
