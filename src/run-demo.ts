import 'dotenv/config';
import { searchContent } from './tools/search_content.js';

async function main() {
  try {
    const res = await searchContent({
      q: 'Klexikon',
      page: 1,
      per_page: 10,
      content_type: 'FILES'
    });
    console.log(`Ergebnis-Knoten: ${res.nodes?.length ?? 0}`);
    if (res.nodes?.length) {
      const first = res.nodes[0];
      const title = first.properties?.['cclom:title']?.[0] || first.properties?.['cm:title']?.[0] || first.properties?.['cm:name']?.[0];
      console.log('Beispiel-Titel:', title);
    }
  } catch (e: any) {
    console.error('Suche fehlgeschlagen:', e?.message || e);
    process.exitCode = 1;
  }
}

main();
