// CapitalForge Brand Theme
// Primary palette: Navy #0A1628 / Gold #C9A84C

export const Colors = {
  // Primary brand
  navy: '#0A1628',
  navyLight: '#132238',
  navyMid: '#1C3050',
  gold: '#C9A84C',
  goldLight: '#D9BC72',
  goldDark: '#A8873C',

  // Neutral
  white: '#FFFFFF',
  offWhite: '#F7F8FA',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  black: '#000000',

  // Semantic
  success: '#10B981',
  successLight: '#D1FAE5',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  info: '#3B82F6',
  infoLight: '#DBEAFE',

  // Status badges
  statusApproved: '#10B981',
  statusPending: '#F59E0B',
  statusDeclined: '#EF4444',
  statusReview: '#3B82F6',
  statusExpired: '#6B7280',

  // Backgrounds
  backgroundPrimary: '#F7F8FA',
  backgroundCard: '#FFFFFF',
  backgroundDark: '#0A1628',
} as const;

export const Typography = {
  // Font families (system defaults for RN)
  fontRegular: undefined, // uses system default
  fontMedium: undefined,
  fontBold: undefined,

  // Sizes
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
} as const;

export const Spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  full: 9999,
} as const;

export const Shadow = {
  sm: {
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

export const Theme = {
  colors: Colors,
  typography: Typography,
  spacing: Spacing,
  borderRadius: BorderRadius,
  shadow: Shadow,
} as const;

export type ThemeColors = typeof Colors;
export type ThemeSpacing = typeof Spacing;
