import assert from 'node:assert/strict'
import { parseFlexibleDate } from './semanticValueEquality'

assert.equal(parseFlexibleDate('4 marca 2027'), '2027-03-04')
assert.equal(parseFlexibleDate('4 marca 2027 roku'), '2027-03-04')
assert.equal(parseFlexibleDate('do 7 marca 2027'), '2027-03-07')
assert.equal(parseFlexibleDate('do 7 marca 2027 roku'), '2027-03-07')

assert.equal(parseFlexibleDate('2027-03-04'), '2027-03-04')
assert.equal(parseFlexibleDate('04.03.2027'), '2027-03-04')
assert.equal(parseFlexibleDate('04/03/2027'), '2027-03-04')
assert.equal(parseFlexibleDate('04-03-2027'), '2027-03-04')

assert.equal(parseFlexibleDate('31 lutego 2027'), null)
assert.equal(parseFlexibleDate('31.02.2027'), null)
assert.equal(parseFlexibleDate('do przyszłego wtorku'), null)

console.log('semantic value equality Polish date parsing tests: PASS')
