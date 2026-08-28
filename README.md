# 📁 pi-projects

**Multi-root smart project detection, indexer and `@`-file autocomplete prepender with Git diagnostics for the [Pi coding agent](https://github.com/earendil-works/pi).**

`pi-projects` automaticky prohledává neomezené množství kořenových složek i jejich podsložek, inteligentně detekuje projekty různých technologií, čte stav jejich Git repozitářů a při psaní `@` v editoru agenta Pi předsazuje nalezené projekty na začátek nabídky včetně stavových emotikonů.

---

## ✨ Hlavní funkce

- ⚡ **@-Našeptávání projektů s Git stavem:** Při psaní `@` nebo `@nazev` v editoru předsadí detekované projekty na 1. místo nabídky jako `@cesta/k/projektu/` s přehlednou Git ikonou (`✨`, `📝`, `➕`, `❓`, `🚀`, `📥`, `⚡`).
- 🔀 **Volitelné řazení:** Možnost řadit projekty abecedně (A-Z) nebo podle data poslední změny (`/projects sort [name|mtime]`).
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
| `/projects list` | Zobrazit přehlednou tabulku všech zaindexovaných projektů a Git stavů |
| `/projects show <id\|název>` | Zobrazit detail konkrétního projektu včetně kompletní Git diagnostiky |
| `/projects sort [name\|mtime]` | Nastavit výchozí řazení (name = abecedně, mtime = podle data) |
| `/projects add <cesta> [název]` | Ručně přidat projekt do indexu |
| `/projects remove <id\|cesta>` | Odebrat projekt z indexu a zařadit mezi ignorované |
| `/projects roots` | Zobrazit seznam sledovaných kořenových složek |
| `/projects roots add <cesta>` | Přidat novou kořenovou složku pro skenování |
| `/projects roots remove <cesta>` | Odebrat kořenovou složku |
| `/projects scan` | Spustit okamžité přegenerování indexu a Git informací |
| `/projects search <dotaz>` | Vyhledávat v projektech podle názvu, cesty či typu |
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
  "rescanIntervalMinutes": 30,
  "sortBy": "name"
}
```

---

## 📄 Licence

MIT © [mastnacek](https://github.com/mastnacek)
