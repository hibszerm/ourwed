import { ALLOWED_FIELD_KEYS } from './registry.ts'

export const AI_CONTRACT_MAPPING_RESPONSE_VERSION = '2026-07-v3'

/**
 * Compact structured-output schema (v3).
 * Context, evidence prose, and reasoning are derived locally from block text.
 */
export const STRUCTURED_MAPPING_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'responseVersion',
    'documentAssessment',
    'fields',
    'immutableFindings',
    'warnings',
  ],
  properties: {
    responseVersion: {
      type: 'string',
      enum: [AI_CONTRACT_MAPPING_RESPONSE_VERSION],
    },
    documentAssessment: {
      type: 'object',
      additionalProperties: false,
      required: ['documentType', 'clientPartyCapability'],
      properties: {
        documentType: {
          type: 'string',
          enum: [
            'wedding_photography_contract',
            'wedding_video_contract',
            'wedding_service_contract',
            'unknown',
          ],
        },
        clientPartyCapability: {
          type: 'object',
          additionalProperties: false,
          required: ['physicalMode', 'expectedPersonCount'],
          properties: {
            physicalMode: {
              type: 'string',
              enum: ['composite', 'separate_persons', 'single_person', 'unknown'],
            },
            expectedPersonCount: {
              type: 'integer',
              enum: [0, 1, 2],
            },
          },
        },
      },
    },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'fieldKey',
          'blockId',
          'exactValue',
          'confidence',
          'pairedFieldGroup',
        ],
        properties: {
          fieldKey: { type: 'string', enum: [...ALLOWED_FIELD_KEYS] },
          blockId: { type: 'string' },
          exactValue: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          pairedFieldGroup: { type: ['string', 'null'] },
        },
      },
    },
    immutableFindings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['blockId', 'classification', 'exactValue'],
        properties: {
          blockId: { type: 'string' },
          exactValue: { type: 'string' },
          classification: {
            type: 'string',
            enum: [
              'provider_data',
              'bank_account',
              'package_fact',
              'legal_clause',
              'coverage_fact',
              'delivery_fact',
              'other_immutable',
            ],
          },
        },
      },
    },
    warnings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'blockId', 'relatedFieldKey'],
        properties: {
          code: {
            type: 'string',
            enum: [
              'ambiguous_identity',
              'ambiguous_date',
              'ambiguous_money',
              'missing_required_field',
              'duplicate_candidate',
              'unsupported_payment_structure',
              'possible_provider_confusion',
              'other',
            ],
          },
          blockId: { type: ['string', 'null'] },
          relatedFieldKey: {
            type: ['string', 'null'],
            enum: [...ALLOWED_FIELD_KEYS, null],
          },
        },
      },
    },
  },
} as const
