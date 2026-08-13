// P5-GRD1 FIX: Custom ESLint rule — no-hardcoded-cost
module.exports = {
  meta: { type: "problem", docs: { description: "Use computeCallCostUsd() instead of hardcoded cost" } },
  create(context) {
    return {
      Literal(node) {
        if (node.value === 0.0003 || node.value === "0.0003") {
          context.report({ node, message: "Use computeCallCostUsd() from @/lib/ai/cost-rates instead of hardcoded 0.0003" });
        }
      },
    };
  },
};
