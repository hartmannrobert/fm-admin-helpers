/**
 * Fusion Manage script snippets library.
 * Used by the script editor "Insert snippet" feature.
 * Add new snippets to the array; each has: id, name, description, code.
 * Each code string should end with a newline so inserts are followed by a line break.
 */
(function () {
  window.FM = window.FM || {};
  window.FM.scriptSnippets = [
    {
      id: "return-true",
      name: "Return true",
      description: "Return true from a condition/validation script",
      code: "returnValue(true);\n"
    },
    {
      id: "return-false",
      name: "Return false",
      description: "Return false from a condition/validation script",
      code: "returnValue(false);\n"
    },
    {
      id: "status-check",
      name: "Status check",
      description: "Check item status (OPEN or PENDING)",
      code: "if (item.STATUS === 'OPEN' || item.STATUS === 'PENDING') {\n  returnValue(true);\n} else {\n  returnValue(false);\n}\n"
    },
    {
      id: "field-not-empty",
      name: "Field not empty",
      description: "Return true if a field has a value",
      code: "if (item.FIELD_ID && String(item.FIELD_ID).trim() !== '') {\n  returnValue(true);\n} else {\n  returnValue(false);\n}\n"
    },
    {
      id: "field-equals",
      name: "Field equals value",
      description: "Return true if field equals a given value",
      code: "if (item.FIELD_ID === 'VALUE') {\n  returnValue(true);\n} else {\n  returnValue(false);\n}\n"
    },
    {
      id: "multi-select-contains",
      name: "Multi-select contains",
      description: "Check if a multi-select field contains a value",
      code: "if (item.FIELD_ID && item.FIELD_ID.indexOf('OPTION_VALUE') !== -1) {\n  returnValue(true);\n} else {\n  returnValue(false);\n}\n"
    },
    {
      id: "linked-item-field",
      name: "Linked item field",
      description: "Access a field on a linked item",
      code: "var value = item.LINKED_FIELD_ID && item.LINKED_FIELD_ID.NESTED_FIELD_ID ? item.LINKED_FIELD_ID.NESTED_FIELD_ID : null;\nreturnValue(value);\n"
    },
    {
      id: "try-catch-return",
      name: "Try/catch with return",
      description: "Safe block with returnValue in try and false on error",
      code: "try {\n  // your logic here\n  returnValue(true);\n} catch (e) {\n  returnValue(false);\n}\n"
    },
    {
      id: "comment-block",
      name: "Comment block",
      description: "Multi-line comment block",
      code: "/*\n * Description\n */\n"
    },
    {
      id: "get-current-user",
      name: "Get current user",
      description: "Get current user ID (when available in context)",
      code: "var userId = _plm && _plm.callFunc ? _plm.callFunc('getCurrentUserID') : null;\n"
    },
    {
      id: "call-func",
      name: "Call PLM function",
      description: "Call a Fusion Manage API function via _plm.callFunc",
      code: "var result = _plm && _plm.callFunc ? _plm.callFunc('methodName', 'arg') : null;\n"
    },
    {
      id: "simple-condition",
      name: "Simple condition template",
      description: "Template for a condition script with one check",
      code: "if (item.SOME_FIELD === 'EXPECTED') {\n  returnValue(true);\n}\nreturnValue(false);\n"
    },
    {
      id: "validation-with-message",
      name: "Validation with message",
      description: "Validation that can set an error message",
      code: "if (!item.REQUIRED_FIELD || String(item.REQUIRED_FIELD).trim() === '') {\n  returnValue(false);\n  // setErrorMessage('Field is required'); if supported\n} else {\n  returnValue(true);\n}\n"
    },
    {
      id: "compare-dates",
      name: "Compare dates",
      description: "Compare two date fields (ISO string comparison)",
      code: "var d1 = item.DATE_FIELD_1 ? String(item.DATE_FIELD_1) : '';\nvar d2 = item.DATE_FIELD_2 ? String(item.DATE_FIELD_2) : '';\nreturnValue(d1 <= d2);\n"
    },
    {
      id: "empty-check",
      name: "Empty / null check",
      description: "Return true if value is non-empty",
      code: "var val = item.FIELD_ID;\nvar ok = val !== null && val !== undefined && String(val).trim() !== '';\nreturnValue(ok);\n"
    }
  ];
})();
