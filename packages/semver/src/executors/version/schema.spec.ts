import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as ts from 'typescript';

const SCHEMA_TYPES_PATH = resolve(__dirname, 'schema.d.ts');
const SCHEMA_JSON_PATH = resolve(__dirname, 'schema.json');
const INTERFACE_NAME = 'VersionBuilderSchema';

function getInterfaceMemberNames(filePath: string, name: string): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf-8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );

  const declaration = sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === name,
  );

  if (declaration === undefined) {
    throw new Error(`Could not find the ${name} interface in ${filePath}.`);
  }

  return declaration.members
    .filter(ts.isPropertySignature)
    .map((member) => member.name.getText(sourceFile));
}

function getSchemaPropertyNames(filePath: string): string[] {
  const schema = JSON.parse(readFileSync(filePath, 'utf-8'));

  return Object.keys(schema.properties);
}

describe('version schema', () => {
  const typedOptions = getInterfaceMemberNames(
    SCHEMA_TYPES_PATH,
    INTERFACE_NAME,
  );
  const declaredOptions = getSchemaPropertyNames(SCHEMA_JSON_PATH);

  it('should collect options from both sides', () => {
    /* Guards against a parse that silently yields nothing, which would make
     * the parity assertions below pass without comparing anything. */
    expect(typedOptions).not.toEqual([]);
    expect(declaredOptions).not.toEqual([]);
  });

  it('should declare every typed option in schema.json', () => {
    /* Options missing from schema.json are unknown to Nx, hence Nx skips type
     * coercion for them and `--option=false` reaches the executor as the
     * truthy string 'false'. */
    const optionsMissingFromSchemaJson = typedOptions.filter(
      (option) => !declaredOptions.includes(option),
    );

    expect(optionsMissingFromSchemaJson).toEqual([]);
  });

  it('should type every option declared in schema.json', () => {
    /* Options missing from the interface are advertised to users while the
     * code has no type for them. */
    const optionsMissingFromSchemaTypes = declaredOptions.filter(
      (option) => !typedOptions.includes(option),
    );

    expect(optionsMissingFromSchemaTypes).toEqual([]);
  });
});
