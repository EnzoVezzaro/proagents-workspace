import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "src/public/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "error",
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      "no-console": "off",
    },
  }
);
