import { describe, expect, it } from 'vitest';
import { graphql } from './generated/gql';
import { ViewerDocument } from './generated/graphql';

const VIEWER_QUERY =
  'query Viewer {\n  viewer {\n    id\n    email\n    name\n    tenants {\n      id\n      name\n      slug\n    }\n    memberships {\n      id\n      role\n      tenant {\n        id\n        slug\n        name\n      }\n      location {\n        id\n        slug\n        name\n      }\n    }\n  }\n}';

describe('graphql codegen', () => {
  it('returns the typed Viewer DocumentNode when the operation is registered', () => {
    const doc = graphql(VIEWER_QUERY);
    expect(doc).toBe(ViewerDocument);
  });

  it('exposes the Viewer query as a DocumentNode with the expected operation name', () => {
    expect(ViewerDocument.kind).toBe('Document');
    const op = ViewerDocument.definitions.find((d) => d.kind === 'OperationDefinition');
    expect(op?.kind).toBe('OperationDefinition');
    if (op?.kind === 'OperationDefinition') {
      expect(op.name?.value).toBe('Viewer');
    }
  });
});
