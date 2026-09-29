const replaceBlockTextSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    blockId: { type: 'string' },
    operation: { type: 'string', enum: ['REPLACE_BLOCK_TEXT'] },
    finalText: { type: 'string' },
  },
  required: ['blockId', 'operation', 'finalText'],
}

const insertBlockSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    anchorBlockId: { type: 'string' },
    operation: { type: 'string', enum: ['INSERT_BLOCK_AFTER', 'INSERT_BLOCK_BEFORE'] },
    finalText: { type: 'string' },
    styleSourceBlockId: { type: 'string' },
  },
  required: ['anchorBlockId', 'operation', 'finalText', 'styleSourceBlockId'],
}

const deleteBlockSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    blockId: { type: 'string' },
    operation: { type: 'string', enum: ['DELETE_BLOCK'] },
  },
  required: ['blockId', 'operation'],
}

const missingInputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    explanation: { type: 'string' },
    inputType: { enum: ['text', 'date', 'number'] },
    required: { enum: [true] },
    sourceContext: { type: 'string' },
    infoText: { type: ['string', 'null'] },
  },
  required: ['id', 'label', 'explanation', 'inputType', 'required', 'sourceContext', 'infoText'],
}

const conflictSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    field: { type: 'string' },
    label: { type: 'string' },
    explanation: { type: 'string' },
    inputType: { enum: ['date', 'text', 'number'] },
    currentValue: { type: ['string', 'null'] },
    relatedValues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { label: { type: 'string' }, value: { type: 'string' } },
        required: ['label', 'value'],
      },
    },
    required: { enum: [true] },
  },
  required: ['id', 'field', 'label', 'explanation', 'inputType', 'currentValue', 'relatedValues', 'required'],
}

export const PLANNER_OPERATION_SCHEMAS = [replaceBlockTextSchema, insertBlockSchema, deleteBlockSchema] as const

export const PLANNER_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { enum: ['MISSING_INPUT', 'CONFLICT_INPUT', 'READY'] },
    missingInputs: { type: 'array', items: missingInputSchema },
    conflicts: { type: 'array', items: conflictSchema },
    blockOperations: { type: 'array', items: { anyOf: PLANNER_OPERATION_SCHEMAS } },
  },
  required: ['status', 'missingInputs', 'conflicts', 'blockOperations'],
} as const
