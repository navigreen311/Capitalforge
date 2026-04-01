// ============================================================
// applications/ barrel export
// ============================================================

// ── Core components ─────────────────────────────────────────────────────────

export { ApplicationCard } from './ApplicationCard';
export type { ApplicationCardApp, ApplicationCardProps } from './ApplicationCard';

export { ApplicationDetailDrawer } from './ApplicationDetailDrawer';
export type { ApplicationDetailDrawerProps } from './ApplicationDetailDrawer';

export { ApplicationSummaryBar } from './ApplicationSummaryBar';
export type { ApplicationSummary, ApplicationFilterType, } from './ApplicationSummaryBar';

export { ApplicationExportButton } from './ApplicationExportButton';
export type { ApplicationExportButtonProps, ApplicationExportRow } from './ApplicationExportButton';

export { ApplicationColumnHeader } from './ApplicationColumnHeader';
export type { ApplicationColumnHeaderProps } from './ApplicationColumnHeader';

// ── Wizard components ───────────────────────────────────────────────────────

export { ApplicationWizardShell, WizardStepIndicator } from './wizard/ApplicationWizardShell';
export type {
  WizardFormData,
  WizardStepIndicatorProps,
  WizardStepComponentProps,
} from './wizard/ApplicationWizardShell';

// TODO: Export these components once they are created:
// export { ApplicationFilterBar } from './ApplicationFilterBar';
// export { ApplicationTableView } from './ApplicationTableView';
// export { WizardStep1SelectClient } from './wizard/WizardStep1SelectClient';
// export { WizardStep2AssignRound } from './wizard/WizardStep2AssignRound';
// export { WizardStep3SelectCard } from './wizard/WizardStep3SelectCard';
// export { WizardStep4BusinessPurpose } from './wizard/WizardStep4BusinessPurpose';
// export { WizardStep5ReviewConfirm } from './wizard/WizardStep5ReviewConfirm';
