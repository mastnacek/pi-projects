# 📁 pi-projects

**Multi-root smart project detection, indexer and `@`-file autocomplete prepender with Git diagnostics for the [Pi coding agent](https://github.com/earendil-works/pi).**

`pi-projects` automaticky prohledává neomezené množství kořenových složek i jejich podsložek, inteligentně detekuje projekty různých technologií, čte stav jejich Git repozitářů a při psaní `@` v editoru agenta Pi předsazuje nalezené projekty na začátek nabídky včetně stavových emotikonů.

---

## ✨ Hlavní funkce

- ⚡ **@-Našeptávání projektů s Git stavem:** Při psaní `@` nebo `@nazev` v editoru předsadí detekované projekty na 1. místo nabídky jako `@cesta/k/projektu/` s přehlednou Git ikonou (`✨`, `📝`, `➕`, `❓`, `🚀`, `📥`, `⚡`).
- 🔀 **Volitelné řazení:** Možnost řadit projekty abecedně podle názvu (`name`), podle kořenové složky (`root`), data poslední změny (`mtime`), technologie (`type`), počtu souborů (`files`) nebo stavu Gitu (`git`) přes `/projects sort <režim>`.
- 🔎 **Filtrování a pokročilé vyhledávání:** Okamžité filtrování podle kořenové složky, technologie či názvu (`/projects list root:X type:Y name:Z`), nebo fulltextové hodnocené vyhledávání (`/projects search <dotaz>`).
- 🌿 **Čtení stavu Git repozitářů:** Detekuje větve, počet upravených/přidaných souborů a neodeslaných (ahead) či ke stažení (behind) commitů.
- 🔍 **Inteligentní detekce projektů:** Rozpoznává ekosystémy a technologie:
  - **TypeScript / JavaScript:** `package.json`, `tsconfig.json`, `deno.json`, `bun`
  - **Python:** `pyproject.toml`, `setup.py`, `requirements.txt`, `Pipfile`, `poetry.lock`, `tox.ini`
  - **Rust:** `Cargo.toml`
  - **Go:** `go.mod`
  - **C / C++:** `CMakeLists.txt`, `Makefile`, `meson.build`
  - **Java / Kotlin:** `pom.xml`, `build.gradle`, `build.gradle.kts`
  - **.NET / C#:** `*.sln`, `*.csproj`, `*.fsproj`
  - **PHP / Ruby / Dart / Swift:** `composer.json`, `Gemfile`, `pubspec.yaml`, `Package.swift`
  - **Git repozitáře & obecné projekty:** `.git`, `README.md`, `LICENSE`
- 🌳 **Podpora vnořených podsložek (monorepa, pluginy):** Bez problémů detekuje jednotlivé projekty uvnitř složek jako `pi/plugins/plugin-a`, `pi/plugins/plugin-b`.
- 📂 **Neomezený počet kořenových složek:** Možnost přidat libovolné množství cest (`D:/01_programovani`, `C:/dev`, atd.).
- 📌 **Ruční správa projektů:** Možnost ručně přidat nebo ignorovat konkrétní cesty.
- 🚀 **Blesková cache:** Okamžitý start a nulová latence při psaní díky diskové cache a asynchronnímu skenování.
- 🇨🇿 **Kompletní menu a nápověda v češtině:** Lazy loading parametrů podle standardu Pi.

---

## 📦 Instalace

Přidejte repozitář do svých Pi packages v `~/.pi/agent/settings.json`:

```json
{
  "packages": [
    "git:github.com/mastnacek/pi-projects"
  ]
}
```

Nebo nainstalujte přímo přes Pi:

```bash
pi package add git:github.com/mastnacek/pi-projects
```

---

## 🛠️ Příkazy (`/projects` nebo `/proj`)

| Příkaz | Popis |
| --- | --- |
| `/projects list [filtry]` | Zobrazit přehlednou tabulku projektů s volitelnými filtry (`root:X`, `name:Y`, `type:Z`, `sort:W`, `--dirty`, `--clean`) |
| `/projects filter <kritéria>` | Alias pro filtrovaný výpis projektů podle kořene, názvu či technologie |
| `/projects show <id\|název>` | Zobrazit detail konkrétního projektu včetně kompletní Git diagnostiky |
| `/projects sort [režim]` | Nastavit výchozí řazení (`name`, `root`, `mtime`, `type`, `files`, `git`) |
| `/projects search <dotaz>` | Pokročilé vyhledávání v projektech podle názvu, cesty, kořene, typu či značek |
| `/projects pin <id\|název>` | Připnout oblíbený projekt trvale na 1. místo tabulky a našeptávače |
| `/projects unpin <id\|název>` | Odepnout připnutý projekt |
| `/projects add <cesta> [název]` | Ručně přidat projekt do indexu |
| `/projects remove <id\|cesta>` | Odebrat projekt z indexu a zařadit mezi ignorované |
| `/projects roots` | Zobrazit seznam sledovaných kořenových složek |
| `/projects roots add <cesta>` | Přidat novou kořenovou složku pro skenování |
| `/projects roots remove <cesta>` | Odebrat kořenovou složku |
| `/projects scan` | Spustit okamžité přegenerování indexu a Git informací |
| `/projects status` | Zobrazit statistiky, stav řazení a stav @-našeptávače |
| `/projects help` | Zobrazit nápovědu v češtině s legendou emotikonů |

---

## 🌿 Git Stavové Emotikony

- `✨` — Čistý repozitář (aktuální a beze změn)
- `📝` — Neuložené / změněné soubory (modified)
- `➕` — Připravené změny ke commitu (staged)
- `❓` — Nové nesledované soubory (untracked)
- `🚀` — Neodeslané commity na server (ahead)
- `📥` — Nové commity na vzdáleném serveru (behind)
- `⚡` — Rozvětvení / divergence (ahead & behind)

---

## 🤖 Nástroje pro LLM Agenta

Rozšíření registruje tyto nástroje přímo pro agenta:

- `list_projects` — Vrátí seznam projektů s možností filtrování podle kořenové složky (`root`), názvu (`name`) či technologie (`type`) a volitelným řazením (`sortBy`).
- `search_projects` — Vyhledá a seřadí projekty podle relevance k zadanému dotazu s možností dodatečných filtrů.
- `add_project_root` — Přidá novou kořenovou složku pro skenování projektů.
- `add_project_manually` — Ručně zaregistruje konkrétní projekt.

---

## ⚙️ Konfigurace

Uživatelská konfigurace se ukládá v `~/.pi/agent/pi-projects.json`:

```json
{
  "roots": [
    "D:/01_programovani"
  ],
  "manualProjects": [],
  "excludedPaths": [],
  "maxDepth": 5,
  "prependToAtAutocomplete": true,
  "rescanIntervalMinutes": 30,
  "sortBy": "name"
}
```

---

## 📄 Licence

MIT © [mastnacek](https://github.com/mastnacek)
