import type { WeddingPlaceRole } from '@/types/travel'
import { CoupleContactFields } from '@/features/weddings/detail/editing/fields/CoupleContactFields'
import { FinanceFields } from '@/features/weddings/detail/editing/fields/FinanceFields'
import { LocationRoleFields } from '@/features/weddings/detail/editing/fields/LocationRoleFields'
import { NoteFields } from '@/features/weddings/detail/editing/fields/NoteFields'
import { PackageFields } from '@/features/weddings/detail/editing/fields/PackageFields'
import { TaskFields } from '@/features/weddings/detail/editing/fields/TaskFields'
import { WeddingDateFields } from '@/features/weddings/detail/editing/fields/WeddingDateFields'
import {
  getEditorSectionMeta,
  isLocationEditorSection,
  normalizeEditorSection,
  type WeddingEditorSection,
} from '@/features/weddings/detail/editing/weddingEditorTypes'
import fieldStyles from '@/features/weddings/detail/editing/WeddingEditorFields.module.css'
import type { WeddingDetailSharedProps } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import { WeddingEditDrawerV2 } from '@/features/weddings/detail/v2/WeddingEditDrawerV2'

interface WeddingWorkspaceEditSurfaceProps {
  props: WeddingDetailSharedProps
  focusSection: WeddingEditorSection
  saving?: boolean
  saveError?: string | null
  onSave: () => void
  onClose: () => void
}

function locationRolesForSection(
  section: WeddingEditorSection,
): WeddingPlaceRole[] | undefined {
  if (section === 'bride_preparation') return ['bride_preparation']
  if (section === 'groom_preparation') return ['groom_preparation']
  if (section === 'ceremony') return ['ceremony']
  if (section === 'reception') return ['reception']
  return undefined
}

function resolveDrawerSection(
  focusSection: WeddingEditorSection,
): Exclude<WeddingEditorSection, null> {
  if (isLocationEditorSection(focusSection)) {
    return focusSection === 'locations' ? 'locations' : focusSection
  }
  return normalizeEditorSection(focusSection)
}

/**
 * V2-native editor host — drawer overlay; does not replace the workspace shell
 * and does not import V1 presentational components.
 */
export function WeddingWorkspaceEditSurface({
  props: p,
  focusSection,
  saving = false,
  saveError = null,
  onSave,
  onClose,
}: WeddingWorkspaceEditSurfaceProps) {
  const drawerSection = resolveDrawerSection(focusSection)
  const meta = getEditorSectionMeta(drawerSection)
  const locationOnly = isLocationEditorSection(focusSection)

  return (
    <WeddingEditDrawerV2
      open
      title={meta.title}
      description={meta.description}
      busy={saving}
      hideSave={locationOnly}
      onClose={onClose}
      onSave={onSave}
    >
      <div
        data-testid="wedding-workspace-edit-surface"
        data-section={drawerSection}
      >
        {saveError ? (
          <p role="alert" className={fieldStyles.error}>
            {saveError}
          </p>
        ) : null}

        {drawerSection === 'contacts' || drawerSection === 'couple' ? (
          <CoupleContactFields
            couple={p.wedding.couple}
            onChange={(couple) => p.onChangeWedding({ couple })}
          />
        ) : null}

        {drawerSection === 'wedding' ? (
          <WeddingDateFields
            wedding={p.wedding}
            onChange={p.onChangeWedding}
          />
        ) : null}

        {drawerSection === 'package' ? (
          <PackageFields
            wedding={p.wedding}
            extras={p.extras}
            packageBasePrice={p.packageBasePrice}
            onChangeWedding={p.onChangeWedding}
            onChangeExtras={p.onChangeExtras}
            onChangePackageBasePrice={p.onChangePackageBasePrice}
          />
        ) : null}

        {drawerSection === 'finances' ? (
          <FinanceFields
            wedding={p.wedding}
            payments={p.payments}
            onChangeWedding={p.onChangeWedding}
            onChangePayments={p.onChangePayments}
          />
        ) : null}

        {drawerSection === 'tasks' ? (
          <TaskFields
            tasks={p.tasks}
            weddingId={p.wedding.id}
            onChangeTasks={p.onChangeTasks}
          />
        ) : null}

        {drawerSection === 'notes' ? (
          <NoteFields notes={p.notes} onChangeNotes={p.onChangeNotes} />
        ) : null}

        {locationOnly ? (
          <LocationRoleFields
            weddingId={p.wedding.id}
            roles={locationRolesForSection(focusSection)}
          />
        ) : null}
      </div>
    </WeddingEditDrawerV2>
  )
}
