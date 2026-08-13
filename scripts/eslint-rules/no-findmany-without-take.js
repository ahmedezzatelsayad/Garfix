// P5-GRD1 FIX: Custom ESLint rule — no-findMany-without-take
module.exports = {
  meta: { type: "problem", docs: { description: "findMany must have take: limit" } },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee?.property?.name === "findMany") {
          const args = node.arguments?.[0];
          if (args?.type === "ObjectExpression") {
            const hasTake = args.properties.some(p => p.key?.name === "take");
            const hasAggregate = node.parent?.callee?.property?.name === "aggregate";
            if (!hasTake && !hasAggregate) {
              context.report({ node, message: "findMany must include take: <limit> to prevent unbounded queries" });
            }
          }
        }
      },
    };
  },
};
