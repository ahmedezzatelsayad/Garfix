/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - Animation Components (مكونات الحركة)
 * 
 * Exports:
 * - GarfixAnimatedContainer: Wrapper with enter/exit/stagger/scroll animations
 * - GarfixMotionDiv: High-level motion with hover/press/drag
 * - GarfixPageTransition: Page/route transitions
 * - GarfixAnimatedCounter: Number counting animation
 * - GarfixCircularProgress: Progress ring with animation
 * - GarfixStatCounter: Stat display with trend
 * 
 * Plus preset variants:
 * - FadeIn, FadeUp, ScaleIn, SlideDown (containers)
 * - MotionCard, MotionButton, MotionListItem (motion)
 * - FadeTransition, SlideUpTransition, BlurTransition (pages)
 * ═════════════════════════════════════════════════════════════
 */

// Main components
export {
  GarfixAnimatedContainer,
  FadeIn,
  FadeUp,
  ScaleIn,
  SlideDown,
} from './GarfixAnimatedContainer';

export {
  GarfixMotionDiv,
  MotionCard,
  MotionButton,
  MotionListItem,
} from './GarfixMotionDiv';

export {
  GarfixPageTransition,
  FadeTransition,
  SlideUpTransition,
  BlurTransition,
  GarfixLayoutTransition,
} from './GarfixPageTransition';

export {
  GarfixAnimatedCounter,
  GarfixCircularProgress,
  GarfixStatCounter,
} from './GarfixAnimatedCounter';

export type {
  AnimatedContainerProps,
} from './GarfixAnimatedContainer';

export type {
  MotionDivProps,
} from './GarfixMotionDiv';

export type {
  PageTransitionProps,
  LayoutTransitionProps,
} from './GarfixPageTransition';

export type {
  AnimatedCounterProps,
  CircularProgressProps,
  StatCounterProps,
} from './GarfixAnimatedCounter';
