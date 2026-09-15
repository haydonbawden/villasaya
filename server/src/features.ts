/**
 * Module catalogue.
 *
 * A villa is not a hotel. Most of them run on a roster, a task list and a
 * group chat; leave forms and expense claims are things a larger operation
 * wants and a two-staff villa does not. Every module here can be switched off
 * per villa, which hides its navigation, its dashboard tiles and its API.
 *
 * Switching a module off never deletes anything. The routes answer 404 and the
 * rows stay exactly where they were, so turning it back on returns the villa
 * to the state it left. That is the whole contract, and the test suite holds
 * the app to it.
 */

export type FeatureKey = 'tasks' | 'roster' | 'leave' | 'expenses' | 'messages';

export type FeatureDefinition = {
  key: FeatureKey;
  label: string;
  description: string;
  /** Whether a newly created villa starts with this module switched on. */
  defaultEnabled: boolean;
};

export const FEATURES: FeatureDefinition[] = [
  {
    key: 'tasks',
    label: 'Tasks',
    description: 'Jobs to be done, assigned to staff, with checklists and due dates.',
    defaultEnabled: true,
  },
  {
    key: 'roster',
    label: 'Roster',
    description: 'Who works when, published to staff, with shift swaps.',
    defaultEnabled: true,
  },
  {
    key: 'messages',
    label: 'Messages',
    description: 'Channels and direct messages between everyone at the villa.',
    defaultEnabled: true,
  },
  {
    key: 'leave',
    label: 'Leave',
    description: 'Staff request time off and you keep a record of what was taken.',
    defaultEnabled: false,
  },
  {
    key: 'expenses',
    label: 'Expenses',
    description: 'Staff claim what they spent, with receipts, and you approve it.',
    defaultEnabled: false,
  },
];

/** Non-empty tuple, so route schemas can validate against the catalogue. */
export const FEATURE_KEY_LIST = FEATURES.map((feature) => feature.key) as [FeatureKey, ...FeatureKey[]];

const FEATURE_KEYS = new Set<string>(FEATURE_KEY_LIST);

export function isFeatureKey(value: string): value is FeatureKey {
  return FEATURE_KEYS.has(value);
}

/** The set a villa starts with, before anyone visits the Modules tab. */
export function defaultFeatureSet(): Set<FeatureKey> {
  return new Set(FEATURES.filter((feature) => feature.defaultEnabled).map((feature) => feature.key));
}
