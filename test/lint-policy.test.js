import test from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";
import ts from "typescript";

const eslint = new ESLint();

for (const type of ["any", "any[]", "Array<any>", "Promise<any>", "{ value: any }", "(input: any) => any", "*"]) {
    test(`lint rejects JSDoc escape hatch ${type}`, async () => {
        const [result] = await eslint.lintText(`/** @type {${type}} */\nexport const value = 1;`, { filePath: "lint-policy-probe.js" });
        assert.ok(result?.messages.some((message) => message.ruleId === "jsdoc/check-types"));
    });
}

test("lint rejects explicit any in TypeScript declarations", async () => {
    const [result] = await eslint.lintText("export type Invalid = any;", { filePath: "lint-policy-probe.d.ts" });
    assert.ok(result?.messages.some((message) => message.ruleId === "@typescript-eslint/no-explicit-any"));
});

test("lint accepts a checked unknown input instead of any", async () => {
    const [result] = await eslint.lintText("/** @param {unknown} input */\nexport function checked(input) { return typeof input === 'string' ? input : null; }", { filePath: "lint-policy-probe.js" });
    assert.equal(result?.errorCount, 0);
});

test("strict type checking rejects implicit any in application JavaScript", () => {
    const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists);
    assert.ok(configPath);
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
    const fileName = `${process.cwd()}/type-policy-probe.js`;
    const source = "export function identity(input) { return input; }";
    const host = ts.createCompilerHost(parsed.options);
    const originalGetSourceFile = host.getSourceFile;
    host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) => path === fileName
        ? ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
        : originalGetSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);
    const program = ts.createProgram([fileName], parsed.options, host);
    assert.ok(ts.getPreEmitDiagnostics(program).some((diagnostic) => diagnostic.code === 7006));
});
