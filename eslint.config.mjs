import js from "@eslint/js";
import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";
import globals from "globals";

export default tseslint.config(
    { ignores: ["node_modules/**", ".agents/**"] },
    {
        files: ["**/*.{js,mjs}"],
        extends: [js.configs.recommended],
        languageOptions: { globals: globals.node },
        plugins: { jsdoc },
        settings: {
            jsdoc: {
                mode: "typescript",
                preferredTypes: {
                    any: { message: "Use a concrete domain type or unknown with validation, never any.", unifyParentAndChildTypeChecks: true },
                    "*": { message: "Use unknown with validation instead of the wildcard any type." },
                },
            },
        },
        rules: {
            "no-unused-vars": ["error", { args: "after-used", caughtErrors: "none", varsIgnorePattern: "^[A-Z].*" }],
            "jsdoc/check-types": "error",
        },
    },
    {
        files: [".github/extensions/pixel-agents-canvas/src/office-client.js"],
        languageOptions: { globals: globals.browser },
    },
    {
        files: ["**/*.ts"],
        extends: [tseslint.configs.recommended],
        rules: { "@typescript-eslint/no-explicit-any": "error" },
    },
    {
        files: [".github/extensions/pixel-agents-canvas/extension.mjs", ".github/extensions/pixel-agents-canvas/src/**/*.js"],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
        },
        plugins: { "@typescript-eslint": tseslint.plugin },
        rules: {
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-argument": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-unsafe-member-access": "error",
            "@typescript-eslint/no-unsafe-return": "error",
        },
    },
);
