const replaceBlockTextSchema = {
  type: 'object', additionalProperties: false,
  properties: { blockId: { type: 'string' }, operation: { type: 'string', enum: ['REPLACE_BLOCK_TEXT'] }, finalText: { type: 'string' } },
  required: ['blockId', 'operation', 'finalText'],
}
const insertBlockSchema = {
  type: 'object', additionalProperties: false,
  properties: { anchorBlockId: { type: 'string' }, operation: { type: 'string', enum: ['INSERT_BLOCK_AFTER', 'INSERT_BLOCK_BEFORE'] }, finalText: { type: 'string' }, styleSourceBlockId: { type: 'string' } },
  required: ['anchorBlockId', 'operation', 'finalText', 'styleSourceBlockId'],
}
const deleteBlockSchema = {
  type: 'object', additionalProperties: false,
  properties: { blockId: { type: 'string' }, operation: { type: 'string', enum: ['DELETE_BLOCK'] } },
  required: ['blockId', 'operation'],
}
const missingInputSchema = {
  type: 'object', additionalProperties: false,
  properties: { id: { type: 'string' }, label: { type: 'string' }, explanation: { type: 'string' }, inputType: { type: 'string', enum: ['text', 'date', 'number'] }, required: { type: 'boolean', enum: [true] }, sourceContext: { type: 'string' }, infoText: { type: ['string', 'null'] }, sourceRefs: { type: 'array', items: { type: 'string' } }, inventoryItemIds: { type: 'array', items: { type: 'string' } } },
  required: ['id', 'label', 'explanation', 'inputType', 'required', 'sourceContext', 'infoText', 'sourceRefs', 'inventoryItemIds'],
}
const authoritySchema = {
  type: 'object', additionalProperties: false,
  properties: { kind: { type: 'string', enum: ['crm', 'user', 'generation_date', 'derived'] }, ref: { type: 'string' } },
  required: ['kind', 'ref'],
}
const factChangeSchema = {
  type: 'object', additionalProperties: false,
  properties: { label: { type: 'string' }, inventoryItemIds: { type: 'array', items: { type: 'string' } }, newValue: { type: 'string' }, newValueFormat: { type: 'string', enum: ['literal', 'polish_pln_words'] }, authority: authoritySchema },
  required: ['label', 'inventoryItemIds', 'newValue', 'newValueFormat', 'authority'],
}
const retainedLiteralSchema = {
  type: 'object', additionalProperties: false,
  properties: { inventoryItemId: { type: 'string' }, authority: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: ['product_rule', 'user'] }, ref: { type: 'string' } }, required: ['kind', 'ref'] }, reason: { type: 'string' } },
  required: ['inventoryItemId', 'authority', 'reason'],
}
const operationSchema = { anyOf: [replaceBlockTextSchema, insertBlockSchema, deleteBlockSchema] }
export const PLANNER_OPERATION_SCHEMAS = [replaceBlockTextSchema, insertBlockSchema, deleteBlockSchema] as const
export const SOURCE_INVENTORY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, label: { type: 'string' }, occurrences: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { sourceRef: { type: 'string' }, quote: { type: ['string', 'null'] } }, required: ['sourceRef', 'quote'] } } }, required: ['id', 'label', 'occurrences'] } } },
  required: ['items'],
} as const
export const PLANNER_RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['MISSING_INPUT', 'CONFLICT_INPUT', 'READY'] },
    missingInputs: { type: 'array', items: missingInputSchema },
    conflicts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, field: { type: 'string' }, label: { type: 'string' }, explanation: { type: 'string' }, inputType: { type: 'string', enum: ['date', 'text', 'number'] }, currentValue: { type: ['string', 'null'] }, relatedValues: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] } }, required: { type: 'boolean', enum: [true] } }, required: ['id', 'field', 'label', 'explanation', 'inputType', 'currentValue', 'relatedValues', 'required'] } },
    factChanges: { type: 'array', items: factChangeSchema },
    retainedLiterals: { type: 'array', items: retainedLiteralSchema },
    operations: { type: 'array', items: operationSchema },
  },
  required: ['status', 'missingInputs', 'conflicts', 'factChanges', 'retainedLiterals', 'operations'],
} as const
