import { test } from 'node:test';
import { entriesOf } from '@get-modular/assembly';
import { checkNamespaces } from '@get-modular/conformance';
import { counterGroup } from '../../src/features/counter/composition/counter.group.ts';
import { sessionsGroup } from '../../src/features/sessions/composition/sessions.group.ts';
import { journalDeclaration } from '../../src/features/sessions/composition/journal.declaration.ts';
import { sessionIdDeclaration } from '../../src/features/sessions/composition/session-id.declaration.ts';
import { counterFakeDeclaration } from '../features/counter/testing.ts';
import { storeFakeDeclaration } from '../features/sessions/features/storage/testing.ts';

test('namespaces: counter, sessions, inputs and fakes lie in the test namespace', () => {
  checkNamespaces({
    namespace: 'test',
    declarations: [
      ...entriesOf([counterGroup, sessionsGroup]).map(entry => entry.declaration),
      journalDeclaration,
      sessionIdDeclaration,
      counterFakeDeclaration,
      storeFakeDeclaration,
    ],
  });
});
