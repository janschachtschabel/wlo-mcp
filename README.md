# WLO MCP Server (TypeScript) – Scaffold

Deterministische Kernlogik und Ressourcen für einen MCP-Server, der Inhalte von WirLernenOnline (WLO) via ngsearch abfragt. Dieses Scaffold enthält:

- search_content Kernfunktion (Mapping Label -> WLO-URIs, Paginierung, Request-Aufbau)
- parse_query Heuristiken (optional) für Freitext zu Parametervorschlägen
- Ressourcen (Subjects, Bildungsstufen, Inhaltstypen, Licenses) als JSON
- Prompt-Ressource `resource://prompts/map_nl_to_filters`

Der Streamable-HTTP MCP-Transport für Vercel ist enthalten (`api/mcp.ts`). SSE/Sessions sind in diesem Scaffold nicht aktiv (stateless Mode), können aber bei Bedarf ergänzt werden.

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
- HTTP/SSE-Transport für Serverless (Vercel) hinzufügen (API-Route `api/mcp.ts`).
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

- Deploye dieses Repo nach Vercel. Die Funktion `api/mcp.ts` exponiert einen Streamable HTTP Endpoint.
- Endpoint: `POST https://<dein-projekt>.vercel.app/api/mcp`
- Für Browser-basierte Clients werden CORS-Header gesetzt und `Mcp-Session-Id` exponiert.
- In stateless Mode wird pro Request ein neuer Server/Transport erzeugt (SSE-Notifications nicht aktiv). Für die meisten Tool-Aufrufe ausreichend.

MCP-Client-Konfiguration (z. B. in einem Host, der Remote-HTTP unterstützt):

- URL: `https://<dein-projekt>.vercel.app/api/mcp`
- Transport: Streamable HTTP

### Test mit MCP Inspector

1. Inspector starten und Verbindung konfigurieren:
   - Modus „Remote HTTP“
   - URL: `https://<dein-projekt>.vercel.app/api/mcp` (oder lokal per Reverse Proxy)
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

- Aktivierbar per Env-Variable: `MCP_API_KEY`. Wenn gesetzt, verlangt der Endpoint einen gültigen Schlüssel.
- Akzeptierte Header (einer genügt):
  - `X-Api-Key: <KEY>`
  - `Authorization: Bearer <KEY>`
- CORS ist so konfiguriert, dass `Authorization` und `X-Api-Key` erlaubt sind (siehe `vercel.json`).

Hinweise zur Client-Kompatibilität:

- Viele MCP-Clients (SDKs, eigene Integrationen) können beliebige HTTP-Header mitsenden – dort ist die Nutzung von `X-Api-Key` oder `Authorization: Bearer` problemlos.
- Manche Host-Apps (z. B. GUI-Clients) erlauben ggf. (noch) keine eigenen Header-Felder bei Remote-HTTP-MCP-Verbindungen. In diesem Fall gibt es Alternativen:
  - Lokal per `stdio` verbinden (kein HTTP, somit kein Header nötig).
  - Einen Reverse-Proxy vorschalten, der den API-Key-Header einfügt.
  - Auth temporär deaktivieren (keine `MCP_API_KEY`-Variable setzen) – nur für Tests empfohlen.

Beispiel (Test-Client via Streamable HTTP):

- Wenn dein Client Header setzen kann, verwende `X-Api-Key` oder `Authorization: Bearer`.
- Beispiel cURL (nur zur Veranschaulichung der Header; tatsächliche JSON-RPC-Nachricht variiert):

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $MCP_API_KEY" \
  https://<dein-projekt>.vercel.app/api/mcp \
  -d '{"jsonrpc":"2.0","id":1,"method":"core/initialize","params":{}}'
