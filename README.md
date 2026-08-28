# 📁 pi-projects

**Multi-root smart project detection, indexer and `@`-file autocomplete prepender for the [Pi coding agent](https://github.com/earendil-works/pi).**

`pi-projects` automaticky prohledává neomezené množství kořenových složek i jejich podsložek, inteligentně detekuje projekty různých technologií a při psaní `@` v editoru agenta Pi předsazuje nalezené projekty na začátek nabídky pro bleskovou navigaci a vkládání.

---

## ✨ Hlavní funkce

- ⚡ **@-Našeptávání projektů:** Při psaní `@` nebo `@nazev` v editoru předsadí detekované projekty na 1. místo nabídky jako `@cesta/k/projektu/`.
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
| `/projects list` | Zobrazit přehlednou tabulku všech zaindexovaných projektů |
| `/projects show <id\|název>` | Zobrazit detail konkrétního projektu (technologie, značky, soubory) |
| `/projects add <cesta> [název]` | Ručně přidat projekt do indexu |
| `/projects remove <id\|cesta>` | Odebrat projekt z indexu a zařadit mezi ignorované |
| `/projects roots` | Zobrazit seznam sledovaných kořenových složek |
| `/projects roots add <cesta>` | Přidat novou kořenovou složku pro skenování |
| `/projects roots remove <cesta>` | Odebrat kořenovou složku |
| `/projects scan` | Spustit okamžité přegenerování indexu |
| `/projects search <dotaz>` | Vyhledávat v projektech podle názvu, cesty či typu |
| `/projects status` | Zobrazit statistiky a stav @-našeptávače |
| `/projects help` | Zobrazit nápovědu v češtině |

---

## 🤖 Nástroje pro LLM Agenta

Rozšíření registruje tyto nástroje přímo pro agenta:

- `list_projects` — Vrátí seznam všech detekovaných i ručně přidaných projektů.
- `search_projects` — Vyhledá projekty podle zadaného klíčového slova.
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
  "rescanIntervalMinutes": 30
}
```

---

## 📄 Licence

MIT © [mastnacek](https://github.com/mastnacek)
