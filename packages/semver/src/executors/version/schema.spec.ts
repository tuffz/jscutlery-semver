import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as ts from 'typescript';

const SCHEMA_TYPES_PATH = resolve(__dirname, 'schema.d.ts');
const SCHEMA_JSON_PATH = resolve(__dirname, 'schema.json');
const INTERFACE_NAME = 'VersionBuilderSchema';
const NESTED_OPTION_NAME = 'commitParserOptions';
/* `warn` expects a callback function, which JSON configuration cannot
 * express, hence it is left out of schema.json on purpose. */
const NESTED_OPTIONS_NOT_EXPRESSIBLE_AS_JSON = ['warn'];

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

function getNestedTypeMemberNames(
  filePath: string,
  name: string,
  property: string,
): string[] {
  /* The nested option type is re-exported from a third-party declaration, so
   * its members are resolved through the type checker instead of a hardcoded
   * node_modules path. */
  const program = ts.createProgram([filePath], {
    moduleResolution: ts.ModuleResolutionKind.Node10,
    noEmit: true,
    skipLibCheck: true,
  });
  const sourceFile = program.getSourceFile(filePath);

  if (sourceFile === undefined) {
    throw new Error(`Could not load ${filePath} into a TypeScript program.`);
  }

  const declaration = sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === name,
  );

  if (declaration === undefined) {
    throw new Error(`Could not find the ${name} interface in ${filePath}.`);
  }

  const member = declaration.members
    .filter(ts.isPropertySignature)
    .find((candidate) => candidate.name.getText(sourceFile) === property);

  if (member?.type === undefined) {
    throw new Error(
      `Could not find the type of the ${property} member of ${name}.`,
    );
  }

  return program
    .getTypeChecker()
    .getTypeAtLocation(member.type)
    .getProperties()
    .map((symbol) => symbol.getName());
}

function getSchemaPropertyNames(filePath: string): string[] {
  const schema = JSON.parse(readFileSync(filePath, 'utf-8'));

  return Object.keys(schema.properties);
}

function getNestedSchemaPropertyNames(
  filePath: string,
  property: string,
): string[] {
  const schema = JSON.parse(readFileSync(filePath, 'utf-8'));

  return Object.keys(schema.properties[property].properties);
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

  describe(NESTED_OPTION_NAME, () => {
    const typedNestedOptions = getNestedTypeMemberNames(
      SCHEMA_TYPES_PATH,
      INTERFACE_NAME,
      NESTED_OPTION_NAME,
    );
    const declaredNestedOptions = getNestedSchemaPropertyNames(
      SCHEMA_JSON_PATH,
      NESTED_OPTION_NAME,
    );

    it('should collect nested options from both sides', () => {
      /* Guards against a resolution that silently yields nothing, which would
       * make the parity assertions below pass without comparing anything. */
      expect(typedNestedOptions).not.toEqual([]);
      expect(declaredNestedOptions).not.toEqual([]);
      /* Guards against an exception outliving the option it excuses. */
      expect(typedNestedOptions).toEqual(
        expect.arrayContaining(NESTED_OPTIONS_NOT_EXPRESSIBLE_AS_JSON),
      );
    });

    it('should declare every typed nested option in schema.json', () => {
      /* Nested options missing from schema.json suffer from the same lack of
       * completion, visibility and coercion as top-level ones. */
      const nestedOptionsMissingFromSchemaJson = typedNestedOptions.filter(
        (option) =>
          !declaredNestedOptions.includes(option) &&
          !NESTED_OPTIONS_NOT_EXPRESSIBLE_AS_JSON.includes(option),
      );

      expect(nestedOptionsMissingFromSchemaJson).toEqual([]);
    });

    it('should type every nested option declared in schema.json', () => {
      /* Nested options missing from the type are advertised to users while
       * the code has no type for them. */
      const nestedOptionsMissingFromSchemaTypes = declaredNestedOptions.filter(
        (option) => !typedNestedOptions.includes(option),
      );

      expect(nestedOptionsMissingFromSchemaTypes).toEqual([]);
    });
  });
});
