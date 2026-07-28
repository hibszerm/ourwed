import { WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION } from './config.ts'

/**
 * Strict JSON schema with $defs/$ref to avoid duplicated field envelopes.
 * OpenAI Structured Outputs supports $defs + $ref under strict: true.
 */
export const RECOVERY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'responseVersion',
    'document',
    'clients',
    'wedding',
    'finances',
    'contractedPackage',
    'additionalServices',
    'otherTerms',
    'documentWarnings',
  ],
  $defs: {
    evidence: {
      type: 'object',
      additionalProperties: false,
      required: ['quote', 'page', 'section'],
      properties: {
        quote: { type: 'string' },
        page: { type: ['number', 'null'] },
        section: { type: ['string', 'null'] },
      },
    },
    stringField: {
      type: 'object',
      additionalProperties: false,
      required: ['value', 'rawValue', 'confidence', 'evidence', 'warnings'],
      properties: {
        value: { type: ['string', 'null'] },
        rawValue: { type: ['string', 'null'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        evidence: {
          type: 'array',
          items: { $ref: '#/$defs/evidence' },
        },
        warnings: { type: 'array', items: { type: 'string' } },
      },
    },
    numberField: {
      type: 'object',
      additionalProperties: false,
      required: ['value', 'rawValue', 'confidence', 'evidence', 'warnings'],
      properties: {
        value: { type: ['number', 'null'] },
        rawValue: { type: ['string', 'null'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        evidence: {
          type: 'array',
          items: { $ref: '#/$defs/evidence' },
        },
        warnings: { type: 'array', items: { type: 'string' } },
      },
    },
    client: {
      type: 'object',
      additionalProperties: false,
      required: [
        'fullName',
        'firstName',
        'lastName',
        'email',
        'phone',
        'addressLine',
        'postalCode',
        'city',
        'country',
      ],
      properties: {
        fullName: { $ref: '#/$defs/stringField' },
        firstName: { $ref: '#/$defs/stringField' },
        lastName: { $ref: '#/$defs/stringField' },
        email: { $ref: '#/$defs/stringField' },
        phone: { $ref: '#/$defs/stringField' },
        addressLine: { $ref: '#/$defs/stringField' },
        postalCode: { $ref: '#/$defs/stringField' },
        city: { $ref: '#/$defs/stringField' },
        country: { $ref: '#/$defs/stringField' },
      },
    },
  },
  properties: {
    responseVersion: {
      type: 'string',
      enum: [WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION],
    },
    document: {
      type: 'object',
      additionalProperties: false,
      required: ['contractNumber', 'signingDate'],
      properties: {
        contractNumber: { $ref: '#/$defs/stringField' },
        signingDate: { $ref: '#/$defs/stringField' },
      },
    },
    clients: {
      type: 'object',
      additionalProperties: false,
      required: ['partner1', 'partner2'],
      properties: {
        partner1: { $ref: '#/$defs/client' },
        partner2: { $ref: '#/$defs/client' },
      },
    },
    wedding: {
      type: 'object',
      additionalProperties: false,
      required: [
        'weddingDate',
        'ceremonyTime',
        'ceremonyLocation',
        'receptionLocation',
        'bridePreparationLocation',
        'groomPreparationLocation',
      ],
      properties: {
        weddingDate: { $ref: '#/$defs/stringField' },
        ceremonyTime: { $ref: '#/$defs/stringField' },
        ceremonyLocation: { $ref: '#/$defs/stringField' },
        receptionLocation: { $ref: '#/$defs/stringField' },
        bridePreparationLocation: { $ref: '#/$defs/stringField' },
        groomPreparationLocation: { $ref: '#/$defs/stringField' },
      },
    },
    finances: {
      type: 'object',
      additionalProperties: false,
      required: [
        'totalContractValue',
        'currency',
        'depositAmount',
        'depositDueDate',
        'remainingAmount',
        'finalPaymentDueDate',
        'paymentTermsText',
      ],
      properties: {
        totalContractValue: { $ref: '#/$defs/numberField' },
        currency: { $ref: '#/$defs/stringField' },
        depositAmount: { $ref: '#/$defs/numberField' },
        depositDueDate: { $ref: '#/$defs/stringField' },
        remainingAmount: { $ref: '#/$defs/numberField' },
        finalPaymentDueDate: { $ref: '#/$defs/stringField' },
        paymentTermsText: { $ref: '#/$defs/stringField' },
      },
    },
    contractedPackage: {
      type: 'object',
      additionalProperties: false,
      required: [
        'name',
        'originalDescription',
        'includedItems',
        'coverageHours',
        'coverageTimeRange',
        'deliveryDeadlineText',
      ],
      properties: {
        name: { $ref: '#/$defs/stringField' },
        originalDescription: { $ref: '#/$defs/stringField' },
        includedItems: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['text', 'confidence', 'evidence'],
            properties: {
              text: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              evidence: {
                type: 'array',
                items: { $ref: '#/$defs/evidence' },
              },
            },
          },
        },
        coverageHours: { $ref: '#/$defs/numberField' },
        coverageTimeRange: { $ref: '#/$defs/stringField' },
        deliveryDeadlineText: { $ref: '#/$defs/stringField' },
      },
    },
    additionalServices: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name',
          'description',
          'price',
          'currency',
          'confidence',
          'evidence',
          'warnings',
        ],
        properties: {
          name: { type: 'string' },
          description: { type: ['string', 'null'] },
          price: { type: ['number', 'null'] },
          currency: { type: ['string', 'null'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidence: {
            type: 'array',
            items: { $ref: '#/$defs/evidence' },
          },
          warnings: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    otherTerms: {
      type: 'object',
      additionalProperties: false,
      required: ['deliveryTerms', 'cancellationTerms', 'notesRelevantToExecution'],
      properties: {
        deliveryTerms: { $ref: '#/$defs/stringField' },
        cancellationTerms: { $ref: '#/$defs/stringField' },
        notesRelevantToExecution: { $ref: '#/$defs/stringField' },
      },
    },
    documentWarnings: { type: 'array', items: { type: 'string' } },
  },
}
