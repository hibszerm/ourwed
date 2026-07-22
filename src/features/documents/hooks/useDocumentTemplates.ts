import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { documentTemplateService } from '@/lib/api/documents'
import type {
  DocumentDocType,
  DocumentTemplateStatus,
} from '@/types/documents'

export const documentTemplateKeys = {
  all: ['document-templates'] as const,
  list: (userId: string | null) =>
    [...documentTemplateKeys.all, 'list', userId] as const,
  detail: (userId: string | null, id: string) =>
    [...documentTemplateKeys.all, 'detail', userId, id] as const,
  versions: (userId: string | null, id: string) =>
    [...documentTemplateKeys.all, 'versions', userId, id] as const,
}

export function useDocumentTemplates() {
  const userId = useStudioAuthId() ?? null
  return useQuery({
    queryKey: documentTemplateKeys.list(userId),
    queryFn: () => documentTemplateService.listSummaries(),
    enabled: Boolean(userId),
  })
}

export function useDocumentTemplate(id: string | undefined) {
  const userId = useStudioAuthId() ?? null
  return useQuery({
    queryKey: documentTemplateKeys.detail(userId, id ?? ''),
    queryFn: () => documentTemplateService.getSummary(id!),
    enabled: Boolean(userId && id),
  })
}

export function useDocumentTemplateVersions(id: string | undefined) {
  const userId = useStudioAuthId() ?? null
  return useQuery({
    queryKey: documentTemplateKeys.versions(userId, id ?? ''),
    queryFn: () => documentTemplateService.listVersions(id!),
    enabled: Boolean(userId && id),
  })
}

export function useDocumentTemplateMutations(templateId?: string) {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId() ?? null

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: documentTemplateKeys.all })
    if (templateId) {
      await queryClient.invalidateQueries({
        queryKey: documentTemplateKeys.detail(userId, templateId),
      })
      await queryClient.invalidateQueries({
        queryKey: documentTemplateKeys.versions(userId, templateId),
      })
    }
  }

  const upload = useMutation({
    mutationFn: (input: Parameters<typeof documentTemplateService.uploadTemplate>[0]) =>
      documentTemplateService.uploadTemplate(input),
    onSuccess: invalidate,
  })

  const rename = useMutation({
    mutationFn: ({
      id,
      name,
      description,
      docType,
      status,
    }: {
      id: string
      name?: string
      description?: string | null
      docType?: DocumentDocType
      status?: DocumentTemplateStatus
    }) =>
      documentTemplateService.update(id, {
        name,
        description,
        docType,
        status,
      }),
    onSuccess: invalidate,
  })

  const duplicate = useMutation({
    mutationFn: (id: string) => documentTemplateService.duplicate(id),
    onSuccess: invalidate,
  })

  const archive = useMutation({
    mutationFn: (id: string) => documentTemplateService.archive(id),
    onSuccess: invalidate,
  })

  const restore = useMutation({
    mutationFn: (id: string) => documentTemplateService.restore(id),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: string) => documentTemplateService.remove(id),
    onSuccess: async () => {
      await invalidate()
      await queryClient.invalidateQueries({ queryKey: ['questionnaire-templates'] })
      await queryClient.invalidateQueries({ queryKey: ['form-definitions'] })
    },
  })

  const setDefault = useMutation({
    mutationFn: (id: string) => documentTemplateService.setDefault(id),
    onSuccess: invalidate,
  })

  const uploadVersion = useMutation({
    mutationFn: ({
      id,
      file,
      notes,
    }: {
      id: string
      file: File
      notes?: string | null
    }) => documentTemplateService.uploadNewVersion(id, file, { notes }),
    onSuccess: invalidate,
  })

  const setCurrentVersion = useMutation({
    mutationFn: ({
      templateId: tid,
      versionId,
    }: {
      templateId: string
      versionId: string
    }) => documentTemplateService.setCurrentVersion(tid, versionId),
    onSuccess: invalidate,
  })

  const duplicateVersion = useMutation({
    mutationFn: (versionId: string) =>
      documentTemplateService.duplicateVersion(versionId),
    onSuccess: invalidate,
  })

  return {
    upload,
    rename,
    duplicate,
    archive,
    restore,
    remove,
    setDefault,
    uploadVersion,
    setCurrentVersion,
    duplicateVersion,
  }
}
