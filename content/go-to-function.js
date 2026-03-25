/**
 * Parse Fusion Manage script sources for function *definition* lines only (not calls).
 * Search / ranking helpers are separate from UI (see feature-scripts.js).
 */
(function () {
  window.FM = window.FM || {};

  /** @typedef {{ functionName: string, lineNumber: number, lineText: string, patternType: string }} FunctionDefinitionCandidate */

  /**
   * Walk source once without building a full lines[] array (memory-friendly on large files).
   * lineNumber is 1-based (human); use lineNumber - 1 for Ace row index.
   * @param {string} source
   * @returns {FunctionDefinitionCandidate[]}
   */
  function parseScriptFunctionDefinitions(source) {
    const out = [];
    if (typeof source !== "string" || source.length === 0) return out;

    const IDENT = "[$A-Za-z_][$A-Za-z0-9_]*";
    const reAsyncFn = new RegExp("^\\s*async\\s+function\\s+(" + IDENT + ")\\s*\\(");
    const reFn = new RegExp("^\\s*function\\s+(" + IDENT + ")\\s*\\(");
    const reVarFn = new RegExp("^\\s*var\\s+(" + IDENT + ")\\s*=\\s*function\\s*\\(");
    const reLetFn = new RegExp("^\\s*let\\s+(" + IDENT + ")\\s*=\\s*function\\s*\\(");
    const reConstFn = new RegExp("^\\s*const\\s+(" + IDENT + ")\\s*=\\s*function\\s*\\(");

    let lineStart = 0;
    let lineNumber = 1;
    const n = source.length;

    for (let p = 0; p <= n; p += 1) {
      if (p < n && source.charCodeAt(p) !== 10) continue;

      const line = source.slice(lineStart, p);
      let m = reAsyncFn.exec(line);
      let patternType = "";
      if (m) {
        patternType = "async-function";
      } else if ((m = reFn.exec(line))) {
        patternType = "function-declaration";
      } else if ((m = reVarFn.exec(line))) {
        patternType = "var-function-expr";
      } else if ((m = reLetFn.exec(line))) {
        patternType = "let-function-expr";
      } else if ((m = reConstFn.exec(line))) {
        patternType = "const-function-expr";
      }

      if (m && m[1]) {
        out.push({
          functionName: m[1],
          lineNumber: lineNumber,
          lineText: line,
          patternType: patternType
        });
      }

      lineStart = p + 1;
      lineNumber += 1;
    }

    return out;
  }

  /**
   * Filter by partial name match; prefer exact, then prefix, then substring. Stable tie-break: shorter name, then line order.
   * @param {FunctionDefinitionCandidate[]} candidates
   * @param {string} rawQuery
   * @returns {FunctionDefinitionCandidate[]}
   */
  function filterRankFunctionCandidates(candidates, rawQuery) {
    const q = String(rawQuery || "").trim();
    if (!q || !Array.isArray(candidates)) return [];

    const ql = q.toLowerCase();
    const ranked = [];

    for (let i = 0; i < candidates.length; i += 1) {
      const c = candidates[i];
      if (!c || typeof c.functionName !== "string") continue;
      const nl = c.functionName.toLowerCase();
      let tier;
      if (nl === ql) {
        tier = 0;
      } else if (nl.startsWith(ql)) {
        tier = 1;
      } else if (nl.indexOf(ql) !== -1) {
        tier = 2;
      } else {
        continue;
      }
      ranked.push({
        candidate: c,
        tier: tier,
        nameLen: c.functionName.length
      });
    }

    ranked.sort(function (a, b) {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.nameLen !== b.nameLen) return a.nameLen - b.nameLen;
      return a.candidate.lineNumber - b.candidate.lineNumber;
    });

    return ranked.map(function (r) {
      return r.candidate;
    });
  }

  /**
   * All definition candidates in source order (by line number). Copy-safe; does not mutate input.
   * @param {FunctionDefinitionCandidate[]} candidates
   * @returns {FunctionDefinitionCandidate[]}
   */
  function sortFunctionDefinitionsByLine(candidates) {
    if (!Array.isArray(candidates)) return [];
    return candidates.slice().sort(function (a, b) {
      const la = a && typeof a.lineNumber === "number" ? a.lineNumber : 0;
      const lb = b && typeof b.lineNumber === "number" ? b.lineNumber : 0;
      return la - lb;
    });
  }

  FM.parseScriptFunctionDefinitions = parseScriptFunctionDefinitions;
  FM.filterRankFunctionCandidates = filterRankFunctionCandidates;
  FM.sortFunctionDefinitionsByLine = sortFunctionDefinitionsByLine;
})();
