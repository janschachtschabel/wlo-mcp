# WLO MCP Server (TypeScript) – Scaffold

Deterministische Kernlogik und Ressourcen für einen MCP-Server, der Inhalte von WirLernenOnline (WLO) via ngsearch abfragt. Dieses Scaffold enthält:

- search_content Kernfunktion (Mapping Label -> WLO-URIs, Paginierung, Request-Aufbau)
- parse_query Heuristiken (optional) für Freitext zu Parametervorschlägen
- Ressourcen (Subjects, Bildungsstufen, Inhaltstypen, Licenses) als JSON
- Prompt-Ressource `resource://prompts/map_nl_to_filters`

Der Streamable-HTTP MCP-Transport für Vercel ist enthalten (`api/server.ts`). SSE/Sessions sind in diesem Scaffold nicht aktiv (stateless Mode), können aber bei Bedarf ergänzt werden.

## Quickstart

1. Abhängigkeiten installieren:

```bash
npm i
```

2. Demo ausführen (führt eine Beispielsuche aus und gibt die Anzahl der Treffer aus):

```bash
npm run dev
# oder
npm run demo
```

Optional: Umgebung anpassen (Standard ist das öffentliche WLO):

```
# .env
WLO_BASE_URL=https://redaktion.openeduhub.net
```

## Kern-API (Programmatic)

Die Suchfunktion befindet sich in `src/tools/search_content.ts`:

```ts
import { searchContent } from './tools/search_content';

const res = await searchContent({
  q: 'Klexikon',
  subject: 'Biologie',
  educational_context: 'Sekundarstufe I',
  media_type: 'Arbeitsblatt',
  page: 1,
  per_page: 10,
  content_type: 'FILES'
});
```

Die Freitext-Parsing-Funktion (optional) in `src/tools/parse_query.ts`:

```ts
import { parseQuery } from './tools/parse_query';

const out = parseQuery({ query_text: 'Mathe 5. Klasse Arbeitsblatt von Klexikon' });
console.log(out.suggested_params, out.confidence, out.notes);
```

## Ressourcen

- `resources/filters/subjects.json` – deutsche Labels -> URIs (virtual:taxonid)
- `resources/filters/educational_contexts.json` – Labels -> URIs (ccm:educationalcontext)
- `resources/filters/media_types.json` – Labels -> URIs (ccm:oeh_lrt_aggregated)
- `resources/filters/licenses.json` – Codes (noch nicht im search_content genutzt)
- `resources/prompts/map_nl_to_filters.txt`

## Nächste Schritte (MCP + Vercel)

- MCP-Tools registrieren: `search_content` (deterministisch) und optional `parse_query`.
- Resource-Pfade als `resource://filters/*.json` und `resource://prompts/map_nl_to_filters` veröffentlichen.
- HTTP/SSE-Transport für Serverless (Vercel) hinzufügen (API-Route `api/server.ts`).
- CORS/Security und optional Auth.

Wenn du möchtest, setze ich das im nächsten Commit direkt um und liefere dir einen lauffähigen Remote-MCP-Endpoint für Vercel.

## MCP Nutzung

### Lokal per stdio

1. Build

```bash
npm run build
```

2. Start (stdio)

```bash
npm run stdio
```

Nutze z. B. den [MCP Inspector](https://github.com/modelcontextprotocol/inspector), um dich via stdio zu verbinden.

#### Konvention: Quelle (`source`)

- Setze den Parameter `source` nur, wenn die Quelle vom Nutzer explizit verlangt wird (z. B. „nur Klexikon“, „Quelle: Klexikon“, „von Klexikon“).
- Im Regelfall nur `q`, `subject`, `educational_context`, `media_type` setzen.

### Remote (Vercel, Streamable HTTP)

- Deploye dieses Repo nach Vercel. Die Funktion `api/server.ts` exponiert einen Streamable HTTP Endpoint.
- Endpoint (Rewrite): `POST https://<dein-projekt>.vercel.app/mcp`
- Direkt: `POST https://<dein-projekt>.vercel.app/api/server`
- Für Browser-basierte Clients werden CORS-Header gesetzt und `Mcp-Session-Id` exponiert.
- In stateless Mode wird pro Request ein neuer Server/Transport erzeugt (SSE-Notifications nicht aktiv). Für die meisten Tool-Aufrufe ausreichend.

MCP-Client-Konfiguration (z. B. in einem Host, der Remote-HTTP unterstützt):

- URL: `https://<dein-projekt>.vercel.app/mcp`
- Direkt: `https://<dein-projekt>.vercel.app/api/server`
- Transport: Streamable HTTP

### Test mit MCP Inspector

1. Inspector starten und Verbindung konfigurieren:
   - Modus „Remote HTTP“
   - URL: `https://<dein-projekt>.vercel.app/mcp` (oder direkt `https://<dein-projekt>.vercel.app/api/server`)
2. Nach dem Connect sollten die Resources, Tools und der Prompt sichtbar sein:
   - Tools: `search_content`, `parse_query`
   - Resources: `resource://filters/*`, `resource://prompts/map_nl_to_filters`
3. Beispiel-Toolaufruf:

```json
{
  "q": "Klexikon",
  "subject": "Biologie",
  "media_type": "Arbeitsblatt",
  "educational_context": "Sekundarstufe I",
  "page": 1,
  "per_page": 10,
  "content_type": "FILES"
}
```

Bei unbekannten Labels bekommst du eine hilfreiche Fehlermeldung inklusive Liste erlaubter Werte.

## Auth & Access Control

- Aktuell: Keine Authentifizierung aktiviert. Der Endpoint ist ohne Header nutzbar (z. B. für OpenAI, das nur „None“ oder OAuth anbietet).
- Wenn Auth benötigt wird, empfiehlt sich OAuth gemäß Vercel-Doku:
  - Docs: https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel#enabling-authorization
  - Idee: Protected Resource Metadata unter `/.well-known/oauth-protected-resource` + Token-Validierung (Authorization: Bearer).
- API-Key-Header (X-Api-Key) ist möglich, wird aber von manchen Hosts nicht unterstützt (z. B. OpenAI UI). Deshalb derzeit deaktiviert.
