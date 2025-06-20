// prettier.config.js
module.exports = {
  plugins: ["@trivago/prettier-plugin-sort-imports"],

  importOrder: ["^react$", "^next", "^[a-zA-Z0-9]", "^@repo/(.*)$", "^[./]"],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
};
