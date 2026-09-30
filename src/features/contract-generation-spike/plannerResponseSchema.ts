const missingInputSchema = {
  type: 'object', additionalProperties: false,
  properties: { id: { type: 'string' }, label: { type: 'string' }, explanation: { type: 'string' }, inputType: { type: 'string', enum: ['text', 'date', 'number'] }, required: { type: 'boolean', enum: [true] }, sourceContext: { type: 'string' }, infoText: { type: ['string', 'null'] }, sourceRefs: { type: 'array', items: { type: 'string' } }, inventoryItemIds: { type: 'array', items: { type: 'string' } } },
  required: ['id', 'label', 'explanation', 'inputType', 'required', 'sourceContext', 'infoText', 'sourceRefs', 'inventoryItemIds'],
}
const factChangeSchema = {
  type: 'object', additionalProperties: false,
  properties: { label: { type: 'string' }, inventoryItemId: { type: 'string' }, inventoryItemIds: { type: 'array', items: { type: 'string' } }, sourceRef: { type: 'string' }, expectedSource: { type: 'string' }, sourceProvenance: { type: ['object', 'null'], additionalProperties: false, properties: { inventoryItemId: { type: 'string' }, sourceRef: { type: 'string' }, expectedSource: { type: 'string' } }, required: ['inventoryItemId', 'sourceRef', 'expectedSource'] }, newValue: { type: 'string' }, newValueFormat: { type: 'string', enum: ['literal', 'polish_pln_words'] }, authority: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: ['crm', 'user', 'generation_date', 'derived', 'source'] }, ref: { type: 'string' } }, required: ['kind', 'ref'] } },
  required: ['label', 'inventoryItemId', 'inventoryItemIds', 'sourceRef', 'expectedSource', 'sourceProvenance', 'newValue', 'newValueFormat', 'authority'],
}
const retainedLiteralSchema = {
  type: 'object', additionalProperties: false,
  properties: { inventoryItemId: { type: 'string' }, authority: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: ['product_rule', 'user'] }, ref: { type: 'string' } }, required: ['kind', 'ref'] }, reason: { type: 'string' } },
  required: ['inventoryItemId', 'authority', 'reason'],
}
const extraInsertionSchema = {
  type: 'object', additionalProperties: false,
  properties: { anchorBlockId: { type: 'string' }, styleSourceBlockId: { type: 'string' }, extraIds: { type: 'array', items: { type: 'string' } } },
  required: ['anchorBlockId', 'styleSourceBlockId', 'extraIds'],
}
export const PLANNER_OPERATION_SCHEMAS = [] as const
export const SOURCE_INVENTORY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { coveredSourceRefs: { type: 'array', items: { type: 'string' } }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, label: { type: 'string' }, conceptId: { type: ['string', 'null'] }, occurrences: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { sourceRef: { type: 'string' }, quote: { type: ['string', 'null'] } }, required: ['sourceRef', 'quote'] } } }, required: ['id', 'label', 'conceptId', 'occurrences'] } } },
  required: ['coveredSourceRefs', 'items'],
} as const
export const PLANNER_RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['MISSING_INPUT', 'CONFLICT_INPUT', 'READY'] },
    missingInputs: { type: 'array', items: missingInputSchema },
    conflicts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, field: { type: 'string' }, label: { type: 'string' }, explanation: { type: 'string' }, inputType: { type: 'string', enum: ['date', 'text', 'number'] }, currentValue: { type: ['string', 'null'] }, relatedValues: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] } }, required: { type: 'boolean', enum: [true] } }, required: ['id', 'field', 'label', 'explanation', 'inputType', 'currentValue', 'relatedValues', 'required'] } },
    factChanges: { type: 'array', items: factChangeSchema },
    retainedLiterals: { type: 'array', items: retainedLiteralSchema },
    operations: { type: 'array', items: { type: 'string' } },
    extraInsertions: { type: 'array', items: extraInsertionSchema },
  },
  required: ['status', 'missingInputs', 'conflicts', 'factChanges', 'retainedLiterals', 'operations', 'extraInsertions'],
} as const
