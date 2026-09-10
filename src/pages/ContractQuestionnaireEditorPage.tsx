import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { ProLockIcon } from '@/features/billing/ProLockIcon'
import {
  PRO_LOCKED_ARIA,
  PRO_LOCKED_HINT,
} from '@/features/billing/proGateActions'
import { ContractQuestionnaireSectionEditor } from '@/features/questionnaires/shared-editor/ContractQuestionnaireSectionEditor'
import { GenerateQuestionnaireModal } from '@/features/questionnaires/GenerateQuestionnaireModal'
import { companyDetailsService } from '@/lib/api/companyDetailsService'
import { useQuery } from '@tanstack/react-query'
import styles from '@/features/questionnaires/Questionnaires.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

export function ContractQuestionnaireEditorPage() {
  const userId = useStudioAuthId()
  const { requirePro, isReadOnly, loading: billingLoading } = useProAccessGate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [generateOpen, setGenerateOpen] = useState(false)
  const autoGenerateHandled = useRef(false)
  const { data, dataUpdatedAt, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['company-details', userId, 'questionnaire-config'],
    queryFn: () => companyDetailsService.get(),
    enabled: Boolean(userId),
  })

  // First-run CTA: /ankiety/dane-do-umowy?generate=1 opens the existing modal.
  // Wait until billing gate is ready — requirePro returns false while loading and
  // must not consume the one-shot intent before it can open the modal.
  useEffect(() => {
    if (autoGenerateHandled.current) return
    if (searchParams.get('generate') !== '1') return
    if (billingLoading) return

    autoGenerateHandled.current = true
    const next = new URLSearchParams(searchParams)
    next.delete('generate')
    setSearchParams(next, { replace: true })
    requirePro(() => setGenerateOpen(true), {
      actionKey: 'generate_questionnaire_link',
    })
  }, [billingLoading, requirePro, searchParams, setSearchParams])

  return (
    <AppLayout>
      <PageContainer>
        <div className={styles.pageHeaderRow}>
          <div>
            <h1 className={styles.pageTitle} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
              Ankieta do umowy
            </h1>
          </div>
          <Button
            type="button"
            variant="secondary"
            title={isReadOnly ? PRO_LOCKED_HINT : undefined}
            aria-label={
              isReadOnly
                ? `Wygeneruj link — ${PRO_LOCKED_ARIA}`
                : undefined
            }
            onClick={() =>
              requirePro(
                () => setGenerateOpen(true),
                { actionKey: 'generate_questionnaire_link' },
              )
            }
          >
            {isReadOnly ? <ProLockIcon /> : null}
            Wygeneruj link
          </Button>
        </div>
        {isLoading ? (
          <p className={styles.muted}>Ładowanie konfiguracji ankiety…</p>
        ) : isError ? (
          <p className={styles.errorText} role="alert">
            {getUserFacingErrorMessage(error, 'Nie udało się wczytać konfiguracji ankiety.')}
          </p>
        ) : (
          <ContractQuestionnaireSectionEditor
            initialConfig={data?.questionnaireConfig}
            dataUpdatedAt={dataUpdatedAt}
            readOnly={isReadOnly}
          />
        )}
        <GenerateQuestionnaireModal
          open={generateOpen}
          onClose={() => setGenerateOpen(false)}
          onGenerated={() => void refetch()}
        />
      </PageContainer>
    </AppLayout>
  )
}
