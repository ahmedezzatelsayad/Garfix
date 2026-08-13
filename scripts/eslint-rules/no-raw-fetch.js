// P5-GRD1 FIX (Audit v2 · Phase 5): Custom ESLint rule — no-raw-fetch
// Prevents direct fetch() calls — must use fetchSafe() from @/lib/ssrf
module.exports = {
  meta: { type: "problem", docs: { description: "Use fetchSafe() instead of raw fetch()" } },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.name === "fetch" && !node.callee.property) {
          context.report({ node, message: "Use fetchSafe() from @/lib/ssrf instead of raw fetch()" });
        }
      },
    };
  },
};
