import { Text, type ChangeSpec } from '@codemirror/state'
import { diff } from '@codemirror/merge'

/** Multiple disjoint edits preserve anchors between executable and metadata rewrites. */
export function editorChanges(before: string, after: string): ChangeSpec[] {
  return diff(before, after).map(({ fromA, toA, fromB, toB }) => ({
    from: fromA,
    to: toA,
    // Text.of preserves CR and mixed line endings; CM's string input normalizes them.
    insert: Text.of(after.slice(fromB, toB).split('\n')),
  }))
}
