// Argument completion for /projects, including the `--global` prefix.
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { projects } from "./state.js";

export const SUBCOMMANDS_DOCS = {
  tree: "zobrazit stromovou strukturu projektů a podsložek",
  list: "zobrazit strom / tabulku projektů (filtry: root:X, name:Y, type:Z, sort:W)",
  filter: "filtrovat projekty podle kořene, názvu či technologie",
  show: "zobrazit detail projektu podle ID či názvu",
  sort: "nastavit výchozí řazení (name | root | mtime | type | files | git)",
  search: "vyhledávat v projektech podle dotazu",
  pin: "připnout oblíbený projekt nahoru (<id|název>)",
  unpin: "odepnout projekt (<id|název>)",
  add: "ručně přidat projekt do indexu (<cesta> [název])",
  remove: "odebrat projekt z indexu (<id|cesta>)",
  roots: "správa kořenových složek pro skenování (list | add | remove)",
  scan: "spustit okamžité přegenerování indexu projektů",
  status: "zobrazit statistiky indexu a stav @-našeptávání",
  help: "zobrazit podrobnou nápovědu v češtině",
} satisfies Record<string, string>;

export const getProjectsArgumentCompletions = async (
  prefix: string,
): Promise<AutocompleteItem[] | null> => {
  // `--global` prefix: complete the remainder, then re-prefix the suggestions.
  const globalTrimmed = prefix.trimStart();
  if (globalTrimmed.startsWith("--global")) {
    const afterGlobal = globalTrimmed.slice(8).trimStart();
    const hasTrailingSpace = globalTrimmed.length > 8 || /\s$/.test(prefix);
    if (!hasTrailingSpace && afterGlobal === "") {
      return [
        {
          value: "--global ",
          label: "--global",
          description: "Uložit nastavení globálně (~/.pi/agent/)",
        },
      ];
    }
    const subItems = await getProjectsArgumentCompletions(afterGlobal);
    if (!subItems) return null;
    const remapped: AutocompleteItem[] = [];
    for (const item of subItems) {
      if (item.label === "--global") continue;
      remapped.push({
        value: `--global ${item.value}`,
        label: item.label,
        description: item.description,
      });
    }
    return remapped.length > 0 ? remapped : null;
  }

  const tokens = prefix.split(/\s+/).filter(Boolean);
  const trailingSpace = /\s$/.test(prefix);
  const normalizedPrefix = tokens.join(" ").toLowerCase();

  // N-th Token Completion (2nd or 3rd level parameters)
  if (tokens.length > 1 || (trailingSpace && tokens.length === 1)) {
    const cmd = tokens[0]?.toLowerCase();

    // /projects show <id|name>
    if (cmd === "show") {
      const items = projects.index.projects.map((p) => ({
        value: `show ${p.id}`,
        label: `${p.name}`,
        description: `[${p.type}] ${p.path}`,
      }));
      const filtered = items.filter(
        (i) =>
          i.value.toLowerCase().startsWith(normalizedPrefix) ||
          i.label.toLowerCase().includes(tokens[1]?.toLowerCase() ?? ""),
      );
      return filtered.length > 0 ? filtered : null;
    }

    // /projects remove <id|name>
    if (cmd === "remove" || cmd === "rm") {
      const items = projects.index.projects.map((p) => ({
        value: `remove ${p.id}`,
        label: `${p.name}`,
        description: `[${p.type}] ${p.path}`,
      }));
      const filtered = items.filter(
        (i) =>
          i.value.toLowerCase().startsWith(normalizedPrefix) ||
          i.label.toLowerCase().includes(tokens[1]?.toLowerCase() ?? ""),
      );
      return filtered.length > 0 ? filtered : null;
    }

    // /projects pin <id|name>
    if (cmd === "pin") {
      const items = projects.index.projects.map((p) => ({
        value: `pin ${p.id}`,
        label: `${p.name}`,
        description: `[${p.type}] ${p.path}`,
      }));
      const filtered = items.filter(
        (i) =>
          i.value.toLowerCase().startsWith(normalizedPrefix) ||
          i.label.toLowerCase().includes(tokens[1]?.toLowerCase() ?? ""),
      );
      return filtered.length > 0 ? filtered : null;
    }

    // /projects unpin <id|name>
    if (cmd === "unpin") {
      const items = projects.index.projects.map((p) => ({
        value: `unpin ${p.id}`,
        label: `${p.name}`,
        description: `[${p.type}] ${p.path}`,
      }));
      const filtered = items.filter(
        (i) =>
          i.value.toLowerCase().startsWith(normalizedPrefix) ||
          i.label.toLowerCase().includes(tokens[1]?.toLowerCase() ?? ""),
      );
      return filtered.length > 0 ? filtered : null;
    }

    // /projects sort <name|root|mtime|type|files|git>
    if (cmd === "sort") {
      const sortOptions = [
        {
          value: "sort name",
          label: "sort name",
          description: "Řadit abecedně podle názvu (A-Z)",
        },
        {
          value: "sort root",
          label: "sort root",
          description: "Řadit podle kořenové složky",
        },
        {
          value: "sort mtime",
          label: "sort mtime",
          description: "Řadit podle data poslední změny (nejnovější)",
        },
        {
          value: "sort type",
          label: "sort type",
          description: "Řadit podle technologie / typu",
        },
        {
          value: "sort files",
          label: "sort files",
          description: "Řadit podle počtu souborů",
        },
        {
          value: "sort git",
          label: "sort git",
          description: "Řadit podle stavu Git repozitáře",
        },
      ];
      const filtered = sortOptions.filter((i) =>
        i.value.toLowerCase().startsWith(normalizedPrefix),
      );
      return filtered.length > 0 ? filtered : null;
    }

    // /projects search <query>
    if (cmd === "search" || cmd === "find") {
      const queryTerm = tokens.slice(1).join(" ").toLowerCase();
      const suggestions: AutocompleteItem[] = [];

      // Add matching project names
      for (const p of projects.index.projects) {
        if (!queryTerm || p.name.toLowerCase().includes(queryTerm)) {
          suggestions.push({
            value: `${cmd} ${p.name}`,
            label: `${p.name}`,
            description: `[${p.type}] ${p.path}`,
          });
        }
        if (suggestions.length >= 10) break;
      }

      return suggestions.length > 0 ? suggestions : null;
    }

    // /projects roots <add|remove|list>
    if (cmd === "roots") {
      if (tokens.length === 2 && !trailingSpace) {
        const rootSub = [
          {
            value: "roots list",
            label: "roots list",
            description: "Zobrazit kořenové složky",
          },
          {
            value: "roots add ",
            label: "roots add",
            description: "Přidat kořenovou složku",
          },
          {
            value: "roots remove ",
            label: "roots remove",
            description: "Odebrat kořenovou složku",
          },
        ];
        const filtered = rootSub.filter((i) =>
          i.value.toLowerCase().startsWith(normalizedPrefix),
        );
        return filtered.length > 0 ? filtered : null;
      }

      if (
        tokens[1]?.toLowerCase() === "remove" ||
        tokens[1]?.toLowerCase() === "rm"
      ) {
        const items = projects.config.roots.map((r) => ({
          value: `roots remove ${r}`,
          label: r,
          description: "Odebrat tuto kořenovou složku",
        }));
        const filtered = items.filter((i) =>
          i.value.toLowerCase().startsWith(normalizedPrefix),
        );
        return filtered.length > 0 ? filtered : null;
      }
    }

    // /projects list / filter / tree
    if (
      cmd === "list" ||
      cmd === "ls" ||
      cmd === "filter" ||
      cmd === "tree"
    ) {
      const types = [
        "TypeScript",
        "Node.js",
        "Python",
        "Rust",
        "Go",
        "C/C++",
        "Java/Kotlin",
        ".NET/C#",
        "PHP",
        "Ruby",
        "Flutter/Dart",
        "Swift",
        "Git",
        "General",
      ];
      const typeItems = types.map((t) => ({
        value: `${cmd} ${t.toLowerCase()}`,
        label: `${cmd} ${t}`,
        description: `Filtrovat projekty typu ${t}`,
      }));

      const filterHelpers = [
        {
          value: `${cmd} root:`,
          label: `${cmd} root:<cesta>`,
          description: "Filtrovat podle kořenové složky",
        },
        {
          value: `${cmd} name:`,
          label: `${cmd} name:<text>`,
          description: "Filtrovat podle názvu projektu",
        },
        {
          value: `${cmd} type:`,
          label: `${cmd} type:<typ>`,
          description: "Filtrovat podle typu projektu",
        },
        {
          value: `${cmd} sort:`,
          label: `${cmd} sort:<name|root|mtime|type|files|git>`,
          description: "Řadit výpis podle kritéria",
        },
        {
          value: `${cmd} --dirty`,
          label: `${cmd} --dirty`,
          description: "Zobrazit pouze projekty se změnami v Git",
        },
        {
          value: `${cmd} --clean`,
          label: `${cmd} --clean`,
          description: "Zobrazit pouze čisté Git repozitáře",
        },
      ];

      const rootItems = projects.config.roots.map((r) => ({
        value: `${cmd} root:${r}`,
        label: `${cmd} root:${r}`,
        description: `Filtrovat projekty z kořene ${r}`,
      }));

      const allItems = [...filterHelpers, ...rootItems, ...typeItems];
      const filtered = allItems.filter((i) =>
        i.value.toLowerCase().startsWith(normalizedPrefix),
      );
      return filtered.length > 0 ? filtered : null;
    }

    return null;
  }

  // 1st Token Completion (Subcommands from Dictionary)
  const typed = (tokens[0] ?? "").toLowerCase();
  const NON_TERMINAL = new Set([
    "tree",
    "list",
    "filter",
    "show",
    "sort",
    "search",
    "find",
    "roots",
    "pin",
    "unpin",
    "remove",
    "rm",
  ]);
  const items: AutocompleteItem[] = [];
  if ("--global".startsWith(typed)) {
    items.push({
      value: "--global ",
      label: "--global",
      description: "Uložit nastavení globálně (~/.pi/agent/)",
    });
  }
  for (const [key, description] of Object.entries(SUBCOMMANDS_DOCS)) {
    if (key.toLowerCase().startsWith(typed)) {
      items.push({
        value: NON_TERMINAL.has(key) ? `${key} ` : key,
        label: key,
        description,
      });
    }
  }

  return items.length > 0 ? items : null;
};
