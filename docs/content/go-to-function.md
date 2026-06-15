# go-to-function.js

**World:** ISOLATED (extension context)

**Purpose:** A pure, DOM-free parsing/ranking library that scans a script's source text and extracts function *definition* lines (not call sites), then provides search ranking and line-ordered sorting of those definitions. It backs the "Go to Function" UI in `feature-scripts.js`, exposing its three functions on the global `FM` object. It does no editor I/O and has no side effects beyond attaching to `window.FM`.

## Responsibilities

- Parse a source string line-by-line and detect function definitions via regex (regex-based, not AST).
- Recognize five definition forms: `async function`, `function`, and `var`/`let`/`const` assigned a function expression.
- Produce candidate objects with 1-based line numbers (Ace rows are `lineNumber - 1`).
- Filter and rank candidates against a query by match tier (exact → prefix → substring) with stable tie-breaks.
- Return all candidates sorted by line number for the unfiltered list view.

## Key functions / API

- `FM.parseScriptFunctionDefinitions(source)` → `FunctionDefinitionCandidate[]` — single-pass scan (no full `lines[]` array, memory-friendly on large files); each candidate is `{ functionName, lineNumber (1-based), lineText, patternType }`.
- `FM.filterRankFunctionCandidates(candidates, rawQuery)` → ranked subset — tier 0 exact / tier 1 prefix / tier 2 substring (case-insensitive); ties broken by shorter `functionName`, then line order; returns `[]` for empty query.
- `FM.sortFunctionDefinitionsByLine(candidates)` → copy sorted ascending by `lineNumber` (does not mutate input; copy-safe via `.slice()`).

## Interactions

- Attaches all three functions to `window.FM` (`FM.parseScriptFunctionDefinitions`, `FM.filterRankFunctionCandidates`, `FM.sortFunctionDefinitionsByLine`).
- Consumed by `feature-scripts.js`: `refreshGotoCandidates` (parse), `renderGotoFnResults` (rank/sort). Line numbers feed the `fm-ace-jump-to-definition` event handled in `ace-capture.js`.
- No `chrome.storage`, no events, no DOM access.

## Notes

- Detection is line-prefixed (`^\s*...`): only definitions at the start of a line (after whitespace) are found. Definitions mid-line, object-method shorthand (`foo() {}`), arrow functions (`const f = () =>`), and class methods are NOT detected.
- `patternType` is one of `async-function`, `function-declaration`, `var-function-expr`, `let-function-expr`, `const-function-expr`.
- Identifier pattern is `[$A-Za-z_][$A-Za-z0-9_]*` (allows `$` and `_`).
- The parser does not understand strings/comments — a commented-out or string-embedded `function foo(` at line start would be reported as a definition.
- `filterRankFunctionCandidates` returns `[]` when the query is blank; the UI uses `sortFunctionDefinitionsByLine` for the no-query case instead.
