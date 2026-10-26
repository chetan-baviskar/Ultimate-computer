import { BackArrow } from './BackArrow';

/**
 * Backwards compatible alias kept so older imports of `BackButton` keep
 * working. It now renders the small top-left back arrow instead of the old
 * large labelled button.
 *
 * New code should import `BackArrow` directly.
 */
export const BackButton = BackArrow;
export default BackArrow;
